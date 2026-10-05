/**
 * Runtime configuration. In docker builds the values are inlined at build time
 * (see Dockerfile ARG -> VITE_*), for local dev they can live in .env.
 */
const env = import.meta.env;

export const API_BASE_URL = (env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const SOCKET_URL = (env.VITE_SOCKET_URL ?? "http://localhost:4000").replace(/\/$/, "");

export const STORAGE_KEY = "chat.session";

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