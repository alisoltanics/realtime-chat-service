import assert from "node:assert/strict";
import { test } from "node:test";

import { createRateLimiter } from "../src/rateLimiter.js";

test("rate limiter allows up to max messages inside the window", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(limiter.check("s1").allowed, true);
  assert.equal(limiter.check("s1").allowed, true);
  assert.equal(limiter.check("s1").allowed, true);
  const denied = limiter.check("s1");
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterMs > 0);
});

test("rate limiter is per socket", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("s1").allowed, true);
  assert.equal(limiter.check("s1").allowed, false);
  assert.equal(limiter.check("s2").allowed, true);
});

test("rate limiter window slides", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check("s1", 0).allowed, true);
  assert.equal(limiter.check("s1", 500).allowed, false);
  assert.equal(limiter.check("s1", 1500).allowed, true);
});

test("forget clears a socket budget", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  limiter.check("s1");
  limiter.forget("s1");
  assert.equal(limiter.check("s1").allowed, true);
});
