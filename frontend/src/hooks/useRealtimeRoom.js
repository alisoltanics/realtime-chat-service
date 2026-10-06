import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { EVENTS } from "../lib/config.js";
import { endpoints } from "../lib/api.js";
import { makeClientId } from "../lib/format.js";
import { getSession } from "../lib/session.js";
import { getSocket, socketStatus } from "../lib/socket.js";

const HISTORY_PAGE_SIZE = 30;

/**
 * Owns everything live for one room:
 *   - socket connection status
 *   - room join / leave lifecycle
 *   - presence list
 *   - message history (TanStack Query, keyset pagination) merged with the live
 *     stream coming from Socket.IO
 *
 * Dedupe strategy: the server assigned numeric id is the identity of a message.
 * History pages and live messages are merged into a single Map keyed by that id,
 * and optimistic bubbles are kept in a separate Map keyed by their clientId
 * until the stored version arrives. Therefore a message can render exactly once
 * even if the same message arrives over the socket twice, or arrives from the
 * socket while the history query is refetching.
 */
export function useRealtimeRoom(roomSlug) {
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [roomState, setRoomState] = useState({ joined: false, roomName: null, error: null });
  const [presenceIds, setPresenceIds] = useState([]);
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [liveById, setLiveById] = useState(() => new Map());
  const [pendingByClientId, setPendingByClientId] = useState(() => new Map());
  const [sendError, setSendError] = useState(null);
  const joinedRoomRef = useRef(null);
  const pendingByClientIdRef = useRef(pendingByClientId);

  useEffect(() => {
    pendingByClientIdRef.current = pendingByClientId;
  }, [pendingByClientId]);

  // ---- history (paginated, keyset) ---------------------------------------
  const history = useInfiniteQuery({
    queryKey: ["messages", roomSlug],
    enabled: Boolean(roomSlug),
    initialPageParam: null,
    queryFn: async ({ pageParam, signal }) => {
      const session = getSession();
      if (!session?.access) throw new Error("no session");
      return endpoints.messages(session.access, roomSlug, {
        beforeId: pageParam ?? undefined,
        limit: HISTORY_PAGE_SIZE,
        signal,
      });
    },
    getNextPageParam: (lastPage) => (lastPage?.has_more ? lastPage.next_before_id : undefined),
  });

  // ---- socket lifecycle ---------------------------------------------------
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const sync = () => {
      const status = socketStatus();
      setConnectionStatus(status);
      if (status === "connected") {
        // Re-join after a reconnect / recovery.
        const previous = joinedRoomRef.current;
        if (previous) {
          joinRoom(previous);
          // Messages broadcast while this client was offline never arrive as
          // `message:new`, so re-read the loaded pages to close the gap. The
          // merged view dedupes by message id, so re-fetching is safe.
          history.refetch();
        }
      } else {
        setRoomState((prev) => ({ ...prev, joined: false }));
      }
    };

    socket.on("connect", sync);
    socket.on("disconnect", sync);
    socket.on("connect_error", (error) => {
      setConnectionStatus("error");
      setRoomState((prev) => ({ ...prev, error: error?.message ?? "connection failed" }));
    });

    sync(); // the socket may already be connected when this mounts

    return () => {
      socket.off("connect", sync);
      socket.off("disconnect", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinRoom = useCallback((slug) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit(
      EVENTS.JOIN,
      { room: slug },
      (response) => {
        if (response?.ok) {
          joinedRoomRef.current = slug;
          setRoomState({ joined: true, roomName: response.roomName ?? null, error: null });
          const users = response.presence ?? [];
          setPresenceUsers(users);
          setPresenceIds(users.map((item) => item.id));
        } else {
          setRoomState({
            joined: false,
            roomName: null,
            error: response?.error?.code ?? "join_failed",
          });
        }
      }
    );
  }, []);

  const leaveRoom = useCallback((slug) => {
    const socket = getSocket();
    if (!socket || joinedRoomRef.current !== slug) return;
    socket.emit(EVENTS.LEAVE, { room: slug });
    joinedRoomRef.current = null;
    setRoomState({ joined: false, roomName: null, error: null });
    setPresenceIds([]);
    setPresenceUsers([]);
  }, []);

  useEffect(() => {
    if (!roomSlug) return undefined;
    setLiveById(new Map());
    setPendingByClientId(new Map());
    if (connectionStatus === "connected") joinRoom(roomSlug);
    return () => leaveRoom(roomSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSlug, connectionStatus]);

  // ---- live stream --------------------------------------------------------
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !roomSlug) return undefined;

    const onNew = (payload) => {
      if (payload?.room !== roomSlug || !payload?.message?.id) return;
      setLiveById((prev) => {
        if (prev.has(payload.message.id)) return prev; // already rendered
        const next = new Map(prev);
        next.set(payload.message.id, payload.message);
        return next;
      });
    };

    const onAck = ({ clientId, message }) => {
      if (!clientId) return;
      setPendingByClientId((prev) => {
        if (!prev.has(clientId)) return prev;
        const next = new Map(prev);
        next.delete(clientId); // the stored message arrived via message:new
        return next;
      });
      if (message?.id) {
        setLiveById((prev) => {
          if (prev.has(message.id)) return prev;
          const next = new Map(prev);
          next.set(message.id, message);
          return next;
        });
      }
    };

    const onError = ({ clientId, code }) => {
      setSendError(code);
      if (clientId) {
        setPendingByClientId((prev) => {
          if (!prev.has(clientId)) return prev;
          const next = new Map(prev);
          next.set(clientId, { ...next.get(clientId), failed: true });
          return next;
        });
      }
    };

    const onPresence = (payload) => {
      if (payload?.room !== roomSlug) return;
      const users = payload.onlineUsers ?? (payload.onlineUserIds ?? []).map((id) => ({ id }));
      setPresenceUsers(users);
      setPresenceIds(users.map((user) => user.id));
    };

    const onJoined = (payload) => {
      if (payload?.room !== roomSlug) return;
      setRoomState((prev) => ({ ...prev, joined: true, roomName: payload.roomName ?? null }));
      const users = payload.presence ?? [];
      setPresenceUsers(users);
      setPresenceIds(users.map((item) => item.id));
    };

    const onLeft = (payload) => {
      if (payload?.room === roomSlug) {
        setRoomState((prev) => ({ ...prev, joined: false }));
      }
    };

    const onExpired = () => setRoomState((prev) => ({ ...prev, error: "session_expired" }));

    socket.on(EVENTS.MESSAGE_NEW, onNew);
    socket.on(EVENTS.MESSAGE_ACK, onAck);
    socket.on(EVENTS.MESSAGE_ERROR, onError);
    socket.on(EVENTS.PRESENCE, onPresence);
    socket.on(EVENTS.JOINED, onJoined);
    socket.on(EVENTS.LEFT, onLeft);
    socket.on(EVENTS.EXPIRED, onExpired);

    return () => {
      socket.off(EVENTS.MESSAGE_NEW, onNew);
      socket.off(EVENTS.MESSAGE_ACK, onAck);
      socket.off(EVENTS.MESSAGE_ERROR, onError);
      socket.off(EVENTS.PRESENCE, onPresence);
      socket.off(EVENTS.JOINED, onJoined);
      socket.off(EVENTS.LEFT, onLeft);
      socket.off(EVENTS.EXPIRED, onExpired);
    };
  }, [roomSlug]);

  // ---- merged view model --------------------------------------------------
  const messages = useMemo(() => {
    const byId = new Map();
    for (const page of history.data?.pages ?? []) {
      for (const message of page.results ?? []) byId.set(message.id, message);
    }
    for (const [id, message] of liveById) {
      if (!byId.has(id)) byId.set(id, message);
    }
    const stored = Array.from(byId.values()).sort((a, b) => a.id - b.id);

    const pending = Array.from(pendingByClientId.entries())
      .map(([clientId, value]) => ({ ...value, clientId }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    return { stored, pending };
  }, [history.data, liveById, pendingByClientId]);

  const sendMessage = useCallback(
    (text, existingClientId) => {
      const socket = getSocket();
      const trimmed = text.trim();
      if (!socket || !trimmed || !roomSlug) return false;
      // Re-sending reuses the clientId, so the server treats it as the same
      // message and the unique (room, sender, client_id) index makes it
      // idempotent.
      const clientId = existingClientId ?? makeClientId();
      setSendError(null);
      setPendingByClientId((prev) => {
        const next = new Map(prev);
        next.set(clientId, {
          text: trimmed,
          createdAt: prev.get(clientId)?.createdAt ?? new Date().toISOString(),
          sender: { id: null, username: "me", display_name: "من" },
          pending: true,
          failed: false,
        });
        return next;
      });
      socket.emit(EVENTS.SEND, { room: roomSlug, text: trimmed, clientId }, (response) => {
        if (response?.ok) return; // handled through message:ack / message:new
        setSendError(response?.error?.code ?? "send_failed");
        setPendingByClientId((prev) => {
          if (!prev.has(clientId)) return prev;
          const next = new Map(prev);
          next.set(clientId, { ...next.get(clientId), failed: true });
          return next;
        });
      });
      return true;
    },
    [roomSlug]
  );

  const retryMessage = useCallback(
    (clientId) => {
      const pending = pendingByClientIdRef.current.get(clientId);
      if (!pending) return;
      sendMessage(pending.text, clientId);
    },
    [sendMessage]
  );

  const loadMore = useCallback(() => {
    if (history.hasNextPage && !history.isFetchingNextPage) history.fetchNextPage();
  }, [history]);

  return {
    connectionStatus,
    room: roomState,
    presenceIds,
    presenceUsers,
    messages,
    sendMessage,
    retryMessage,
    sendError,
    isLoadingHistory: history.isLoading,
    historyError: history.error,
    hasMore: history.hasNextPage ?? false,
    isLoadingMore: history.isFetchingNextPage,
    loadMore,
    refetchHistory: history.refetch,
  };
}
