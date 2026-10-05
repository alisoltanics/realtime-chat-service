/**
 * Server-side keep-alive.
 *
 * Socket.IO's own ping/pong keeps the *transport* alive, which is a different
 * concern from the presence TTL: `presence.sweep()` drops any entry whose
 * `lastSeen` is older than PRESENCE_TTL_MS. Without a periodic refresh a
 * perfectly healthy connection would be swept as a ghost user while the user is
 * still reading the room.
 */
import * as presence from "./presence.js";

/** One heartbeat: refresh presence and let the client show a live clock. */
export function heartbeatTick(socket) {
  presence.touch(socket.data.userId);
  socket.emit("presence:tick", { at: Date.now() });
}

/**
 * Start the keep-alive for one socket and stop it on disconnect.
 * @returns {() => void} manual stop, also useful in tests.
 */
export function startSocketHeartbeat(socket, intervalMs) {
  const timer = setInterval(() => heartbeatTick(socket), intervalMs);
  timer.unref();
  const stop = () => clearInterval(timer);
  socket.on("disconnect", stop);
  return stop;
}