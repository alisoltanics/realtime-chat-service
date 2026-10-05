import { STORAGE_KEY } from "./config.js";

/**
 * Session state lives in localStorage (access token, refresh token, user) and
 * is exposed through a tiny subscription so React can react to login/logout and
 * to refresh-token rotation. For the MVP this is plain React state - no
 * external store needed.
 */
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let session = read();

function emit() {
  for (const listener of listeners) listener(session);
}

export function getSession() {
  return session;
}

export function setSession(next) {
  session = next;
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
  emit();
  return session;
}

export function clearSession() {
  return setSession(null);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}