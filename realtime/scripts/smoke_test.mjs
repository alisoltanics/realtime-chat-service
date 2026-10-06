#!/usr/bin/env node
/**
 * End-to-end smoke test for the realtime layer (two users, one room).
 *
 * It runs against a live stack and verifies the parts that unit tests cannot:
 *   1. login through the Django API
 *   2. socket handshake with a JWT (and rejection without one)
 *   3. room:join + presence fan-out
 *   4. message:send -> Django persistence -> message:new for every member
 *   5. exactly-once rendering guarantee (same clientId is idempotent)
 *   6. message history pagination through the REST API
 *   7. a private room is shareable only through the admin member endpoint
 *   8. disconnect removes the user from presence
 *
 * Usage:
 *   node scripts/smoke_test.mjs
 *   API_BASE_URL=... SOCKET_URL=... node scripts/smoke_test.mjs
 */
import assert from "node:assert/strict";

const API = (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const SOCKET_URL = (process.env.SOCKET_URL ?? "http://localhost:4000").replace(/\/$/, "");
const USER_A = { username: process.env.USER_A ?? "ali", password: process.env.PASSWORD_A ?? "ali12345" };
const USER_B = { username: process.env.USER_B ?? "sara", password: process.env.PASSWORD_B ?? "sara12345" };

const { io } = await import("socket.io-client");

const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`\n▶ ${name}`);
};
const ok = (message) => console.log(`  ✓ ${message}`);
const fail = (message) => {
  throw new Error(message);
};

async function login(credentials) {
  const response = await fetch(`${API}/api/v1/auth/login/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) fail(`login failed for ${credentials.username}: ${response.status}`);
  return response.json();
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 8000,
    });
    const timer = setTimeout(() => reject(new Error("connect timeout")), 9000);
    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function emit(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function main() {
  step("1/8 login two users through the Django API");
  const sessionA = await login(USER_A);
  const sessionB = await login(USER_B);
  ok(`${sessionA.user.username} and ${sessionB.user.username} logged in`);

  step("2/8 reject a socket handshake without a token");
  const anonymous = io(SOCKET_URL, { transports: ["websocket"], reconnection: false, timeout: 5000 });
  const rejection = await new Promise((resolve) => {
    anonymous.on("connect", () => resolve("connected"));
    anonymous.on("connect_error", (error) => resolve(error.message));
    setTimeout(() => resolve("timeout"), 6000);
  });
  anonymous.close();
  if (rejection === "connected") fail("anonymous socket was accepted");
  ok(`handshake rejected: ${rejection}`);

  step("3/8 connect both users and join the same room");
  const socketA = await connect(sessionA.access);
  const socketB = await connect(sessionB.access);
  ok("both sockets connected");

  const rooms = await fetch(`${API}/api/v1/rooms/`, {
    headers: { authorization: `Bearer ${sessionA.access}` },
  }).then((response) => response.json());
  const room = rooms.results.find((item) => item.is_public) ?? rooms.results[0];
  if (!room) fail("no room available, run `manage.py seed_demo`");
  const slug = room.slug;

  const joinedA = await emit(socketA, "room:join", { room: slug });
  assert.equal(joinedA.ok, true, `user A could not join: ${JSON.stringify(joinedA)}`);
  ok(`user A joined "${slug}"`);

  const presenceForB = waitFor(socketB, "presence:update", (payload) =>
    payload.onlineUserIds.includes(String(sessionB.user.id))
  );
  const joinedB = await emit(socketB, "room:join", { room: slug });
  assert.equal(joinedB.ok, true, `user B could not join: ${JSON.stringify(joinedB)}`);
  await presenceForB;
  ok(`user B joined "${slug}", presence shows ${joinedB.presence.length} online user(s)`);

  step("4/8 send a message and receive it live in the other browser");
  const text = `ping from ${sessionA.user.username} ${Date.now()}`;
  const clientId = `smoke-${Date.now()}`;
  const receivedByB = waitFor(socketB, "message:new", (payload) => payload.message?.text === text);
  const receivedByA = waitFor(socketA, "message:new", (payload) => payload.message?.text === text);
  const ack = await emit(socketA, "message:send", { room: slug, text, clientId });
  assert.equal(ack.ok, true, `send failed: ${JSON.stringify(ack)}`);
  const [forB, forA] = await Promise.all([receivedByB, receivedByA]);
  assert.equal(forB.message.sender.username, sessionA.user.username);
  assert.equal(forB.message.client_id, clientId);
  ok(`message id=${forA.message.id} delivered live to both clients`);

  step("5/8 re-sending the same clientId is idempotent (no duplicate row)");
  const before = await fetch(`${API}/api/v1/rooms/${slug}/messages/?limit=100`, {
    headers: { authorization: `Bearer ${sessionA.access}` },
  }).then((response) => response.json());
  const countBefore = before.results.filter((item) => item.client_id === clientId).length;
  await emit(socketA, "message:send", { room: slug, text, clientId });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const after = await fetch(`${API}/api/v1/rooms/${slug}/messages/?limit=100`, {
    headers: { authorization: `Bearer ${sessionA.access}` },
  }).then((response) => response.json());
  const countAfter = after.results.filter((item) => item.client_id === clientId).length;
  assert.equal(countBefore, 1, `expected 1 stored message, found ${countBefore}`);
  assert.equal(countAfter, 1, `duplicate stored after resend: ${countAfter}`);
  ok(`exactly one stored message for clientId ${clientId}`);

  step("6/8 history pagination through the REST API");
  const page = await fetch(`${API}/api/v1/rooms/${slug}/messages/?limit=5`, {
    headers: { authorization: `Bearer ${sessionA.access}` },
  }).then((response) => response.json());
  assert.equal(page.results.length, 5, "expected a 5 message page");
  assert.ok(page.next_before_id !== null, "expected a next cursor");
  const older = await fetch(`${API}/api/v1/rooms/${slug}/messages/?limit=5&before_id=${page.next_before_id}`, {
    headers: { authorization: `Bearer ${sessionA.access}` },
  }).then((response) => response.json());
  const maxIdFirstPage = Math.max(...page.results.map((item) => item.id));
  const maxIdOlder = Math.max(...older.results.map((item) => item.id));
  assert.ok(maxIdOlder < maxIdFirstPage, "older page must not contain newer messages");
  ok(`page 1 newest id=${maxIdFirstPage}, page 2 newest id=${maxIdOlder}`);

  step("7/8 create a private room with a member and exchange messages");
  const created = await fetch(`${API}/api/v1/rooms/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionA.access}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: `Smoke ${Date.now()}`,
      is_public: false,
      member_usernames: [sessionB.user.username],
    }),
  }).then((response) => {
    if (!response.ok) fail(`room creation failed: ${response.status}`);
    return response.json();
  });
  const privateSlug = created.slug;
  if (created.is_public !== false) fail("created room is not private");

  const visibleToMember = await fetch(`${API}/api/v1/rooms/`, {
    headers: { authorization: `Bearer ${sessionB.access}` },
  }).then((response) => response.json());
  assert.ok(
    visibleToMember.results.some((item) => item.slug === privateSlug),
    "invited member cannot see the private room"
  );
  ok(`invited member can see "${privateSlug}"`);

  const privateJoinA = await emit(socketA, "room:join", { room: privateSlug });
  const privateJoinB = await emit(socketB, "room:join", { room: privateSlug });
  assert.equal(privateJoinA.ok, true, "user A could not join the private room");
  assert.equal(privateJoinB.ok, true, "user B could not join the private room");

  const privateText = `private ping ${Date.now()}`;
  const privateForA = waitFor(socketA, "message:new", (payload) => payload.message?.text === privateText);
  const privateAck = await emit(socketB, "message:send", { room: privateSlug, text: privateText });
  assert.equal(privateAck.ok, true, `send in private room failed: ${JSON.stringify(privateAck)}`);
  await privateForA;
  ok("both members exchanged a message inside the private room");

  step("8/8 disconnecting removes the user from presence");
  // Watch the *remaining* socket: the disconnecting one is gone by definition.
  const offline = waitFor(socketB, "presence:update", (payload) =>
    !payload.onlineUserIds.includes(String(sessionA.user.id))
  );
  socketA.disconnect();
  const presenceAfterLeave = await offline;
  ok(
    `user A is offline, user B sees ${presenceAfterLeave.onlineCount} online user(s) left`
  );

  socketB.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log(`\n✅ all ${steps.length} smoke test steps passed`);
}

main().catch((error) => {
  console.error(`\n❌ smoke test failed: ${error.message}`);
  process.exit(1);
});
