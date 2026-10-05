/**
 * Socket.IO event contract (also documented in docs/API.md).
 *
 * client -> server
 *   room:join          { room: string }                      -> ack { ok, room, presence }
 *   room:leave         { room: string }                      -> ack { ok, left }
 *   message:send       { room: string, text: string, clientId?: string }
 *                                                        -> ack { ok, message?, error? }
 *   presence:heartbeat {}                                    -> ack { ok }
 *
 * server -> client
 *   room:joined        { room, roomId, roomName, presence }
 *   message:new        { room, message }      (fanned out to the room, incl. sender)
 *   message:ack        { clientId, message }  (sender only; reconciles optimistic bubble)
 *   message:error      { clientId?, code }
 *   presence:update    { room, onlineUserIds, onlineCount }
 *   room:left          { room }
 *   session:expired    {}                    (token no longer valid)
 *   error              { event, code }
 */
import { authorizeRoom, persistMessage } from "./djangoApi.js";
import { logger } from "./logger.js";
import * as presence from "./presence.js";
import { createRateLimiter } from "./rateLimiter.js";

const roomChannel = (roomSlug) => `room:${roomSlug}`;

export const EVENTS = {
  JOIN: "room:join",
  LEAVE: "room:leave",
  SEND: "message:send",
  HEARTBEAT: "presence:heartbeat",
  JOINED: "room:joined",
  MESSAGE_NEW: "message:new",
  MESSAGE_ACK: "message:ack",
  MESSAGE_ERROR: "message:error",
  PRESENCE: "presence:update",
  LEFT: "room:left",
  EXPIRED: "session:expired",
  ERROR: "error",
};

const MAX_ROOM_SLUG_LENGTH = 90;
const MAX_CLIENT_ID_LENGTH = 64;

function sanitizeRoom(raw) {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  if (!slug || slug.length > MAX_ROOM_SLUG_LENGTH || !/^[a-z0-9][a-z0-9._-]*$/.test(slug)) {
    return null;
  }
  return slug;
}

function sanitizeText(raw, maxLength) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (text.length === 0) return null;
  return text.length > maxLength ? null : text;
}

function sanitizeClientId(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, MAX_CLIENT_ID_LENGTH);
}

/**
 * Ids are always strings on the wire: the browser compares them against its own
 * session user id and JS ids arrive as strings from the API, so a numeric id
 * would silently break presence matching.
 */
const presencePayload = (userIds) => userIds.map((id) => ({ id: String(id) }));
const presenceIdsPayload = (userIds) => userIds.map((id) => String(id));

export function registerSocketHandlers(io, socket, options) {
  const log = logger.child({ sid: socket.id });
  const limiter = createRateLimiter(options.rateLimit);
  socket.data.rooms = new Map(); // roomSlug -> { roomId, roomName }
  socket.data.token = socket.handshake.auth?.token ?? null;

  const safe = (eventName, handler) => async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      log.error({ err: error, event: eventName }, "socket.handler_failed");
      socket.emit(EVENTS.ERROR, { event: eventName, code: "internal_error" });
    }
  };

  const broadcastPresence = (roomSlug) => {
    const onlineUserIds = presence.onlineUserIds(roomSlug);
    io.to(roomChannel(roomSlug)).emit(EVENTS.PRESENCE, {
      room: roomSlug,
      onlineUserIds: presenceIdsPayload(onlineUserIds),
      onlineCount: onlineUserIds.length,
    });
  };

  const leaveRoom = async (roomSlug) => {
    if (!socket.data.rooms.has(roomSlug)) return;
    socket.data.rooms.delete(roomSlug);
    await socket.leave(roomChannel(roomSlug));
    socket.emit(EVENTS.LEFT, { room: roomSlug });
    broadcastPresence(roomSlug);
    presence.leaveRoom(socket.data.userId, roomSlug);
  };

  socket.on(
    EVENTS.JOIN,
    safe(EVENTS.JOIN, async (payload, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};
      const roomSlug = sanitizeRoom(payload?.room);
      if (!roomSlug) {
        respond({ ok: false, error: { code: "invalid_room" } });
        return;
      }

      // Django re-validates the token and the room permission on every join.
      const { user, room, access, error } = await authorizeRoom(socket.data.token, roomSlug);
      if (error || !user || !room) {
        log.warn({ roomSlug, error }, "join.denied");
        if (error === "invalid_token") socket.emit(EVENTS.EXPIRED, {});
        respond({ ok: false, error: { code: error ?? "forbidden" } });
        return;
      }
      if (!access.can_read) {
        log.warn({ roomSlug, userId: user.id }, "join.denied");
        respond({ ok: false, error: { code: "forbidden" } });
        return;
      }
      if (String(user.id) !== String(socket.data.userId)) {
        log.warn({ roomSlug, authenticated: socket.data.userId, token: user.id }, "join.identity_mismatch");
        respond({ ok: false, error: { code: "identity_mismatch" } });
        return;
      }

      await socket.join(roomChannel(room.slug));
      socket.data.rooms.set(room.slug, { roomId: room.id, roomName: room.name });
      const entry = presence.addConnection(user.id, socket.id, room.slug);
      const onlineUserIds = presence.onlineUserIds(room.slug);

      log.info(
        { event: EVENTS.JOIN, roomSlug, userId: user.id, socketCount: entry.sockets.size },
        "room.joined"
      );
      socket.emit(EVENTS.JOINED, {
        room: room.slug,
        roomId: room.id,
        roomName: room.name,
        presence: presencePayload(onlineUserIds),
      });
      respond({ ok: true, room: room.slug, presence: presencePayload(onlineUserIds) });
      broadcastPresence(room.slug);
    })
  );

  socket.on(
    EVENTS.LEAVE,
    safe(EVENTS.LEAVE, async (payload, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};
      const roomSlug = sanitizeRoom(payload?.room);
      if (roomSlug) await leaveRoom(roomSlug);
      respond({ ok: true, left: Boolean(roomSlug) });
    })
  );

  socket.on(
    EVENTS.SEND,
    safe(EVENTS.SEND, async (payload, ack) => {
      const respond = typeof ack === "function" ? ack : () => {};
      const userId = socket.data.userId;
      const roomSlug = sanitizeRoom(payload?.room);
      const clientId = sanitizeClientId(payload?.clientId);
      const roomMeta = roomSlug ? socket.data.rooms.get(roomSlug) : undefined;

      const fail = (code) => {
        respond({ ok: false, error: { code } });
        socket.emit(EVENTS.MESSAGE_ERROR, { clientId, code });
      };

      if (!userId) return fail("unauthenticated");
      if (!roomMeta) return fail("not_in_room");
      const text = sanitizeText(payload?.text, options.maxTextLength);
      if (text === null) {
        const code = typeof payload?.text === "string" && payload.text.trim().length > options.maxTextLength
          ? "text_too_long"
          : "invalid_text";
        return fail(code);
      }

      const limit = limiter.check(socket.id);
      if (!limit.allowed) {
        log.warn({ event: EVENTS.SEND, roomSlug, userId }, "message.rate_limited");
        return fail("rate_limited");
      }

      // Persist first, broadcast second: the room only ever receives the
      // canonical (server stored) representation of a message. The browser
      // supplied sender id is never used - it comes from the verified session.
      const { message, error } = await persistMessage({
        roomId: roomMeta.roomId,
        senderId: Number(userId),
        text,
        clientId,
      });
      if (error || !message) {
        log.error({ roomSlug, userId, error }, "message.persist_failed");
        return fail(error ?? "persist_failed");
      }

      presence.touch(userId);
      log.info(
        {
          event: EVENTS.SEND,
          roomSlug,
          userId,
          messageId: message.id,
          textLength: text.length,
        },
        "message.broadcast"
      );
      io.to(roomChannel(roomSlug)).emit(EVENTS.MESSAGE_NEW, { room: roomSlug, message });
      if (clientId) socket.emit(EVENTS.MESSAGE_ACK, { clientId, message });
      respond({ ok: true, message });
    })
  );

  socket.on(
    EVENTS.HEARTBEAT,
    safe(EVENTS.HEARTBEAT, async (payload, ack) => {
      if (socket.data.userId) presence.touch(socket.data.userId);
      if (typeof ack === "function") ack({ ok: true });
    })
  );

  socket.on(
    "disconnect",
    safe("disconnect", async (reason) => {
      limiter.forget(socket.id);
      const rooms = Array.from(socket.data.rooms.keys());
      socket.data.rooms.clear();
      const entry = presence.removeConnection(socket.id);
      log.info(
        {
          userId: socket.data.userId,
          rooms,
          reason,
          ...presence.stats(),
        },
        "socket.disconnected"
      );
      // Presence entry is only dropped when the user's last socket is gone.
      if (!entry || entry.sockets.size > 0) return;
      for (const roomSlug of rooms) broadcastPresence(roomSlug);
    })
  );
}