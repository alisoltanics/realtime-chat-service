/**
 * Per-socket token-bucket-ish rate limiter (simple sliding window) so one
 * connection cannot flood the room or the Django API.
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  return {
    check(socketId, now = Date.now()) {
      const timestamps = (hits.get(socketId) ?? []).filter((ts) => now - ts < windowMs);
      if (timestamps.length >= max) {
        hits.set(socketId, timestamps);
        return { allowed: false, retryAfterMs: windowMs - (now - timestamps[0]) };
      }
      timestamps.push(now);
      hits.set(socketId, timestamps);
      return { allowed: true };
    },
    forget(socketId) {
      hits.delete(socketId);
    },
    clear() {
      hits.clear();
    },
  };
}