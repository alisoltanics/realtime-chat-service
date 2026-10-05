import { API_BASE_URL } from "./config.js";

export class ApiError extends Error {
  constructor(message, { status, code, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Persian text for the error codes the API and the realtime service emit. The
 * server `detail` stays as the fallback so a new code is still readable.
 */
const ERROR_MESSAGES = {
  invalid_credentials: "نام کاربری یا رمز عبور درست نیست",
  not_authenticated: "برای ادامه باید وارد حساب کاربری شوید",
  invalid_token: "نشست شما منقضی شده است؛ دوباره وارد شوید",
  missing_token: "نشست شما منقضی شده است؛ دوباره وارد شوید",
  conflict: "این نام قبلاً استفاده شده است",
  validation_error: "اطلاعات وارد شده معتبر نیست",
  not_found: "موردی با این نشانی پیدا نشد",
  permission_denied: "به این بخش دسترسی ندارید",
  room_private: "این اتاق خصوصی است",
  user_not_found: "کاربری با این مشخصات پیدا نشد",
  service_token_invalid: "دسترسی سرویس‌ها معتبر نیست",
  invalid_cursor: "درخواست تاریخچه معتبر نیست",
  forbidden: "به این اتاق دسترسی ندارید",
  identity_mismatch: "نشست شما با این حساب هم‌خوانی ندارد",
  invalid_room: "نام اتاق معتبر نیست",
  not_in_room: "ابتدا وارد این اتاق شوید",
  invalid_text: "متن پیام معتبر نیست",
  text_too_long: "پیام بیش از حد طولانی است",
  rate_limited: "پیام‌های زیادی فرستادید؛ کمی صبر کنید",
  upstream_unavailable: "سرویس پیام‌رسان در دسترس نیست",
  persist_failed: "ارسال پیام ذخیره نشد؛ دوباره تلاش کنید",
  internal_error: "خطای غیرمنتظره رخ داد",
};

export function messageForCode(code, fallback) {
  return ERROR_MESSAGES[code] ?? fallback;
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function parseError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const error = payload?.error ?? {};
  const detail =
    typeof error.detail === "string"
      ? error.detail
      : Object.values(error.detail ?? {}).flat().join(" ") || response.statusText;
  const code = error.code ?? `http_${response.status}`;
  return new ApiError(messageForCode(code, detail || "request failed"), {
    status: response.status,
    code,
    requestId: error.request_id ?? response.headers.get("x-request-id"),
  });
}

export async function apiFetch(path, { method = "GET", body, token, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && token) onUnauthorized();
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return null;
  return response.json();
}

export const endpoints = {
  register: (payload) => apiFetch("/api/v1/auth/register/", { method: "POST", body: payload }),
  login: (payload) => apiFetch("/api/v1/auth/login/", { method: "POST", body: payload }),
  refresh: (refresh) => apiFetch("/api/v1/auth/refresh/", { method: "POST", body: { refresh } }),
  me: (token, signal) => apiFetch("/api/v1/auth/me/", { token, signal }),
  rooms: (token, signal) => apiFetch("/api/v1/rooms/", { token, signal }),
  createRoom: (token, payload) => apiFetch("/api/v1/rooms/", { method: "POST", body: payload, token }),
  room: (token, slug, signal) => apiFetch(`/api/v1/rooms/${slug}/`, { token, signal }),
  joinRoom: (token, slug) => apiFetch(`/api/v1/rooms/${slug}/join/`, { method: "POST", token }),
  leaveRoom: (token, slug) => apiFetch(`/api/v1/rooms/${slug}/leave/`, { method: "POST", token }),
  messages: (token, slug, { beforeId, limit = 30, signal } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (beforeId) params.set("before_id", String(beforeId));
    return apiFetch(`/api/v1/rooms/${slug}/messages/?${params}`, { token, signal });
  },
  postMessage: (token, slug, payload) =>
    apiFetch(`/api/v1/rooms/${slug}/messages/`, { method: "POST", body: payload, token }),
};
