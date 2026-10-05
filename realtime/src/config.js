/**
 * Environment configuration. Everything is provided through env vars so the
 * same image runs in docker-compose and on a developer machine.
 */
const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  serviceName: process.env.SERVICE_NAME ?? "realtime-service",
  env: process.env.NODE_ENV ?? "production",
  logLevel: process.env.LOG_LEVEL ?? "info",
  port: int(process.env.PORT, 4000),
  host: process.env.HOST ?? "0.0.0.0",

  // Django REST API (authoritative identity + persistence)
  django: {
    baseUrl: (process.env.DJANGO_API_URL ?? "http://django-api:8000").replace(/\/$/, ""),
    serviceToken: process.env.INTERNAL_SERVICE_TOKEN ?? "",
    timeoutMs: int(process.env.DJANGO_TIMEOUT_MS, 5000),
  },

  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),

  // A single message is capped here too (Django enforces the same limit).
  maxTextLength: int(process.env.MAX_MESSAGE_LENGTH, 4000),
  // Anti-spam guard, per socket connection.
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 10_000),
    maxMessages: int(process.env.RATE_LIMIT_MAX_MESSAGES, 20),
  },

  presence: {
    // Stale presence entries (a process killed without a disconnect event) are
    // swept away so "online users" never shows ghosts.
    ttlMs: int(process.env.PRESENCE_TTL_MS, 90_000),
    sweepIntervalMs: int(process.env.PRESENCE_SWEEP_INTERVAL_MS, 15_000),
  },

  heartbeat: {
    intervalMs: int(process.env.HEARTBEAT_INTERVAL_MS, 25_000),
    maxBufferBytes: int(process.env.MAX_BUFFER_BYTES, 1_000_000),
  },
};

export function assertConfig() {
  if (!config.django.serviceToken) {
    throw new Error(
      "INTERNAL_SERVICE_TOKEN is required (shared secret with the Django API internal endpoints)",
    );
  }
}