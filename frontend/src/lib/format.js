const rtlDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
  hour: "2-digit",
  minute: "2-digit",
});

const fullDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

const dayDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", { dateStyle: "full" });

export function formatTime(iso) {
  if (!iso) return "";
  try {
    return rtlDate.format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatDateTime(iso) {
  if (!iso) return "";
  try {
    return fullDate.format(new Date(iso));
  } catch {
    return "";
  }
}

export function formatDay(iso) {
  if (!iso) return "";
  try {
    return dayDate.format(new Date(iso));
  } catch {
    return "";
  }
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function initials(name) {
  return (name ?? "?").trim().slice(0, 2).toUpperCase();
}

export function makeClientId() {
  const random =
    globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12) ??
    Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}${random}`;
}
