import { useEffect, useState } from "react";

import { getSession } from "../lib/session.js";
import { getSocket, socketStatus } from "../lib/socket.js";

/**
 * Global socket connection status (independent of the selected room), so the
 * header badge can show "connecting / connected / offline" even before a room
 * is opened.
 */
export function useConnectionStatus() {
  const [status, setStatus] = useState(() => socketStatus());

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;

    const sync = () => setStatus(socketStatus());

    socket.on("connect", sync);
    socket.on("disconnect", sync);
    socket.on("connect_error", () => setStatus("error"));
    socket.on("reconnect_attempt", () => setStatus("connecting"));
    socket.io.on("reconnect_attempt", () => setStatus("connecting"));
    sync(); // the socket may already be connected when this mounts

    return () => {
      socket.off("connect", sync);
      socket.off("disconnect", sync);
    };
  }, []);

  return status;
}

export function useIsSessionValid() {
  return Boolean(getSession()?.access);
}
