import { io } from "socket.io-client";

import { SOCKET_URL } from "./config.js";
import { getSession } from "./session.js";

/**
 * One Socket.IO connection per browser tab, created lazily once a session
 * exists and reused across rooms. Room membership is explicit via room:join.
 */
let socket = null;

export function getSocket() {
  const session = getSession();
  if (!session?.access) return null;
  if (socket && socket.auth?.token === session.access) return socket;
  disconnectSocket();
  socket = io(SOCKET_URL, {
    auth: { token: session.access },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    reconnectionDelayAttempts: Infinity,
    timeout: 10_000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

/**
 * Reads the current state of the socket. Needed on every mount: the "connect"
 * event may already have fired before a component subscribed, so state has to be
 * synchronised instead of only waiting for the next event.
 */
export function socketStatus() {
  if (!socket) return "disconnected";
  if (socket.connected) return "connected";
  if (socket.active) return "connecting";
  return "disconnected";
}