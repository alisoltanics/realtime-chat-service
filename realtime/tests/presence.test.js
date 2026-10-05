import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { config } from "../src/config.js";
import * as presence from "../src/presence.js";

afterEach(() => presence.reset());

test("presence tracks multiple sockets per user", () => {
  presence.addConnection(1, "s1", "general");
  presence.addConnection(1, "s2", "general");
  assert.equal(presence.isOnline(1), true);
  assert.deepEqual(presence.onlineUserIds("general"), [1]);

  const stillOnline = presence.removeConnection("s1");
  assert.equal(stillOnline.sockets.size, 1);
  assert.equal(presence.isOnline(1), true);

  const offline = presence.removeConnection("s2");
  assert.equal(offline.sockets.size, 0);
  assert.equal(presence.isOnline(1), false);
  assert.deepEqual(presence.onlineUserIds("general"), []);
});

test("presence is per room", () => {
  presence.addConnection(1, "s1", "general");
  presence.addConnection(2, "s2", "frontend");
  assert.deepEqual(presence.onlineUserIds("general"), [1]);
  assert.deepEqual(presence.onlineUserIds("frontend"), [2]);
  assert.equal(presence.onlineCount("general"), 1);
});

test("leaveRoom keeps user online if another room is active", () => {
  presence.addConnection(1, "s1", "general");
  presence.addConnection(1, "s2", "frontend");
  presence.leaveRoom(1, "general");
  assert.equal(presence.onlineCount("general"), 0);
  assert.equal(presence.onlineCount("frontend"), 1);
  assert.equal(presence.isOnline(1), true);
});

test("sweep removes stale presence entries", () => {
  presence.addConnection(1, "s1", "general");
  const originalTtl = config.presence.ttlMs;
  config.presence.ttlMs = -1; // everything looks stale (simulates a dead process)
  const removed = presence.sweep();
  config.presence.ttlMs = originalTtl;

  assert.equal(removed.length, 1);
  assert.equal(removed[0].userId, 1);
  assert.equal(presence.isOnline(1), false);
  assert.deepEqual(presence.onlineUserIds("general"), []);
});

test("sweep keeps entries that were touched", () => {
  presence.addConnection(1, "s1", "general");
  presence.touch(1);
  const originalTtl = config.presence.ttlMs;
  config.presence.ttlMs = 0; // "now" is still within a zero-length window boundary
  const removed = presence.sweep();
  config.presence.ttlMs = originalTtl;

  assert.equal(removed.length, 0);
  assert.equal(presence.isOnline(1), true);
});

test("removeConnection is safe for unknown sockets", () => {
  assert.equal(presence.removeConnection("nope"), null);
});

test("stats reports totals", () => {
  presence.addConnection(7, "s1", "general");
  presence.addConnection(8, "s2", "general");
  const stats = presence.stats();
  assert.equal(stats.onlineUsers, 2);
  assert.equal(stats.mappedRooms, 1);
  assert.equal(stats.sockets, 2);
});
