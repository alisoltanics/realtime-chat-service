/**
 * In-memory presence for a single realtime node.
 *
 * Maps userId -> Set<socketId> plus a lastSeen timestamp used for TTL sweeping,
 * so a process that dies without emitting "disconnect" does not leave ghost
 * online users behind. When this scales to several WebSocket nodes this module
 * is the piece that gets backed by Redis (presence + cross-node broadcast).
 */
import { config } from "./config.js";
import { logger } from "./logger.js";

/** userId -> { sockets: Set<string>, rooms: Set<string>, lastSeen: number } */
const users = new Map();
/** roomSlug -> Set<userId> */
const rooms = new Map();
/** socketId -> userId */
const socketUser = new Map();

let sweeper = null;

function ensureUser(userId) {
  let entry = users.get(userId);
  if (!entry) {
    entry = { sockets: new Set(), rooms: new Set(), lastSeen: Date.now() };
    users.set(userId, entry);
  }
  return entry;
}

export function addConnection(userId, socketId, roomSlug) {
  ensureUser(userId).sockets.add(socketId);
  socketUser.set(socketId, userId);
  if (roomSlug) addRoomMembership(userId, roomSlug);
  return users.get(userId);
}

export function addRoomMembership(userId, roomSlug) {
  ensureUser(userId).rooms.add(roomSlug);
  let members = rooms.get(roomSlug);
  if (!members) {
    members = new Set();
    rooms.set(roomSlug, members);
  }
  members.add(userId);
}

export function removeConnection(socketId) {
  const userId = socketUser.get(socketId);
  if (userId === undefined) return null;
  socketUser.delete(socketId);
  const entry = users.get(userId);
  if (!entry) return null;
  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) {
    entry.lastSeen = Date.now();
    return entry;
  }
  users.delete(userId);
  for (const roomSlug of entry.rooms) {
    rooms.get(roomSlug)?.delete(userId);
    if (rooms.get(roomSlug)?.size === 0) rooms.delete(roomSlug);
  }
  return entry; // entry with an empty socket set means "went offline"
}

/**
 * A socket stops watching a room while the user may still be connected to it
 * from another tab/device, so presence is only dropped if that was the last
 * room the user was present in.
 */
export function leaveRoom(userId, roomSlug) {
  const entry = users.get(userId);
  if (!entry) return false;
  entry.rooms.delete(roomSlug);
  rooms.get(roomSlug)?.delete(userId);
  if (rooms.get(roomSlug)?.size === 0) rooms.delete(roomSlug);
  return true;
}

export function touch(userId) {
  const entry = users.get(userId);
  if (entry) entry.lastSeen = Date.now();
}

export function onlineUserIds(roomSlug) {
  return Array.from(rooms.get(roomSlug) ?? []);
}

export function onlineCount(roomSlug) {
  return rooms.get(roomSlug)?.size ?? 0;
}

export function isOnline(userId) {
  return users.has(userId);
}

/** Drop entries not seen for PRESENCE_TTL_MS. Returns [{userId, roomSlug}] changes. */
export function sweep() {
  const deadline = Date.now() - config.presence.ttlMs;
  const removed = [];
  for (const [userId, entry] of users) {
    if (entry.lastSeen < deadline && entry.sockets.size > 0) {
      for (const socketId of entry.sockets) socketUser.delete(socketId);
      for (const roomSlug of entry.rooms) {
        rooms.get(roomSlug)?.delete(userId);
        if (rooms.get(roomSlug)?.size === 0) rooms.delete(roomSlug);
      }
      users.delete(userId);
      removed.push({ userId, roomSlug: Array.from(entry.rooms)[0] ?? null });
    }
  }
  if (removed.length > 0) {
    logger.warn({ count: removed.length, userIds: removed.map((item) => item.userId) }, "presence.swept");
  }
  return removed;
}

export function startSweeper() {
  if (sweeper) return;
  sweeper = setInterval(sweep, config.presence.sweepIntervalMs);
  sweeper.unref();
}

export function stopSweeper() {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}

export function stats() {
  return { onlineUsers: users.size, mappedRooms: rooms.size, sockets: socketUser.size };
}

export function reset() {
  users.clear();
  rooms.clear();
  socketUser.clear();
}
