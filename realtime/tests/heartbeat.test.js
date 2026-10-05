import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { config } from "../src/config.js";
import { heartbeatTick, startSocketHeartbeat } from "../src/heartbeat.js";
import * as presence from "../src/presence.js";

afterEach(() => presence.reset());

function fakeSocket(userId = 1) {
  const events = [];
  const handlers = new Map();
  return {
    events,
    handlers,
    data: { userId },
    emit: (name, payload) => events.push([name, payload]),
    on: (name, handler) => handlers.set(name, handler),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("heartbeat tick refreshes the presence TTL entry", async () => {
  presence.addConnection(1, "s1", "general");
  await sleep(5);

  const originalTtl = config.presence.ttlMs;
  config.presence.ttlMs = 0; // anything not touched in this tick looks stale
  try {
    assert.equal(presence.sweep().length, 1, "precondition: stale entry is swept");

    presence.addConnection(1, "s1", "general");
    heartbeatTick(fakeSocket(1));

    assert.equal(presence.sweep().length, 0, "a heartbeat must keep the user online");
    assert.equal(presence.isOnline(1), true);
  } finally {
    config.presence.ttlMs = originalTtl;
  }
});

test("heartbeat tick emits presence:tick to the client", () => {
  heartbeatTick(fakeSocket(9));
  const socket = fakeSocket(9);
  heartbeatTick(socket);
  const [name, payload] = socket.events.at(-1);
  assert.equal(name, "presence:tick");
  assert.equal(typeof payload.at, "number");
});

test("startSocketHeartbeat ticks repeatedly and stops on disconnect", async () => {
  presence.addConnection(3, "s1", "general");
  const socket = fakeSocket(3);
  const stop = startSocketHeartbeat(socket, 10);

  await sleep(35);
  assert.ok(socket.events.length >= 2, `expected repeated ticks, got ${socket.events.length}`);
  assert.equal(presence.isOnline(3), true);

  socket.handlers.get("disconnect")();
  const afterStop = socket.events.length;
  await sleep(30);
  assert.equal(socket.events.length, afterStop, "no ticks after disconnect");

  stop(); // idempotent
});
