/**
 * Realtime chat service.
 *
 * Responsibilities:
 *   - terminate Socket.IO connections (no Django Channels on purpose)
 *   - authenticate every connection and room join against the Django API
 *   - validate + persist messages through Django, then fan out the stored copy
 *   - keep in-memory presence for a single node (TTL swept)
 */
import http from "node:http";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";

import { config, assertConfig } from "./config.js";
import { healthCheck, verifyToken } from "./djangoApi.js";
import { startSocketHeartbeat } from "./heartbeat.js";
import { logger } from "./logger.js";
import * as presence from "./presence.js";
import { EVENTS, registerSocketHandlers } from "./socketHandlers.js";

assertConfig();

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, credentials: false }));
app.use(express.json({ limit: "64kb" }));

app.get("/healthz", async (request, response) => {
  const django = await healthCheck();
  const payload = {
    status: django.ok ? "ok" : "degraded",
    service: config.serviceName,
    uptimeSeconds: Math.round(process.uptime()),
    django,
    presence: presence.stats(),
    time: new Date().toISOString(),
  };
  response.status(django.ok ? 200 : 503).json(payload);
});

app.get("/readyz", (request, response) => {
  response.json({ status: "ok", service: config.serviceName });
});

app.get("/presence", (request, response) => {
  const room = String(request.query.room ?? "");
  response.json({
    room,
    onlineUserIds: presence.onlineUserIds(room).map(String),
    onlineCount: presence.onlineCount(room),
    ...presence.stats(),
  });
});

app.use((error, request, response, next) => {
  logger.error({ err: error, path: request.path }, "http.error");
  if (response.headersSent) return next(error);
  response.status(500).json({ error: { code: "internal_error" } });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigins, credentials: false },
  transports: ["websocket", "polling"],
  pingInterval: config.heartbeat.intervalMs,
  pingTimeout: config.heartbeat.intervalMs * 2,
  maxHttpBufferSize: config.heartbeat.maxBufferBytes,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: true,
  },
});

/**
 * Handshake auth: the browser sends its JWT in `auth.token`. Django is the only
 * authority that can turn that token into an identity, so a socket without a
 * verified user never reaches the room handlers.
 */
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || token.length === 0) {
    logger.warn({ sid: socket.id }, "handshake.missing_token");
    return next(Object.assign(new Error("missing_token"), { data: { code: "missing_token" } }));
  }
  const { user, error } = await verifyToken(token);
  if (error || !user) {
    logger.warn({ sid: socket.id, error }, "handshake.invalid_token");
    return next(Object.assign(new Error("invalid_token"), { data: { code: error ?? "invalid_token" } }));
  }
  socket.data.userId = user.id;
  socket.data.username = user.username;
  socket.data.displayName = user.display_name;
  socket.data.token = token;
  return next();
});

io.on("connection", (socket) => {
  logger.info(
    { sid: socket.id, userId: socket.data.userId, transport: socket.conn.transport.name },
    "socket.connected"
  );
  registerSocketHandlers(io, socket, {
    maxTextLength: config.maxTextLength,
    rateLimit: config.rateLimit,
  });
  startSocketHeartbeat(socket, config.heartbeat.intervalMs);
});

io.engine.on("connection_error", (error) => {
  logger.warn({ err: error.message, code: error.code }, "engine.connection_error");
});

presence.startSweeper();

server.listen(config.port, config.host, () => {
  logger.info(
    {
      port: config.port,
      host: config.host,
      env: config.env,
      django: config.django.baseUrl,
      corsOrigins: config.corsOrigins,
      presenceTtlMs: config.presence.ttlMs,
    },
    "service.started"
  );
});

function shutdown(signal) {
  logger.info({ signal }, "service.shutdown_started");
  presence.stopSweeper();
  io.close(() => {
    server.close(() => {
      logger.info("service.stopped");
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "process.unhandled_rejection");
});

export { app, server, io, EVENTS };