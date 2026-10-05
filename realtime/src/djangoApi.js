/**
 * Thin client over the Django internal API.
 *
 * The realtime service never trusts anything the browser sends about identity:
 * the access token is always validated by Django, which is the single source of
 * truth for users, rooms and permissions.
 */
import { config } from "./config.js";
import { logger } from "./logger.js";

const baseLogger = logger.child({ module: "django-api" });

async function request(path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.django.timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${config.django.baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-service-token": config.django.serviceToken,
        "x-request-id": crypto.randomUUID(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    baseLogger.debug(
      { path, method, status: response.status, durationMs: Date.now() - started },
      "django.call"
    );
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    baseLogger.warn(
      { path, method, durationMs: Date.now() - started, err: error },
      "django.unreachable"
    );
    return { ok: false, status: 0, payload: { error: { code: "upstream_unavailable" } } };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the browser JWT to a user. Returns null when the token is invalid/expired. */
export async function verifyToken(token) {
  const { ok, status, payload } = await request("/api/internal/verify-token/", {
    method: "POST",
    body: { token },
  });
  if (!ok) {
    return { user: null, error: payload?.error?.code ?? `http_${status}` };
  }
  return { user: payload.user, error: null };
}

/** Authorize a socket room join for a given token. */
export async function authorizeRoom(token, roomSlug) {
  const { ok, status, payload } = await request("/api/internal/authorize-room/", {
    method: "POST",
    body: { token, room: roomSlug },
  });
  if (!ok) {
    return {
      user: null,
      room: null,
      access: null,
      error: payload?.error?.code ?? `http_${status}`,
    };
  }
  return { user: payload.user, room: payload.room, access: payload.access, error: null };
}

/** Persist a message through Django; idempotent for a given (room, sender, client_id). */
export async function persistMessage({ roomId, senderId, text, clientId }) {
  const { ok, status, payload } = await request("/api/internal/messages/", {
    method: "POST",
    body: { room_id: roomId, sender_id: senderId, text, client_id: clientId ?? "" },
  });
  if (!ok) {
    return { message: null, error: payload?.error?.code ?? `http_${status}` };
  }
  return { message: payload.message, error: null };
}

export async function healthCheck() {
  const { ok, payload } = await request("/api/healthz");
  return { ok, status: payload?.status ?? "unknown", database: payload?.database ?? "unknown" };
}