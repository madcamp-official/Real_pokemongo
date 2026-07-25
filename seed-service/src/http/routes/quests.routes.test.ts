import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  cfg.mediaStorage.localDir = join(tmpdir(), `seed-service-test-${randomUUID()}`);
  cfg.auth.jwtSecret = "test-secret-not-for-production";
  return cfg;
}

async function testServer() {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
}

async function signup(server: Awaited<ReturnType<typeof testServer>>["server"]) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { email: `${randomUUID()}@b.com`, password: "pw12345", nickname: "A", avatar: "fox" },
  });
  return res.json().access_token as string;
}

async function buildMultipartUpload(frames: Uint8Array[]): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  frames.forEach((bytes, i) => {
    form.append("frames", new Blob([bytes as BlobPart], { type: "image/jpeg" }), `frame${i}.jpg`);
  });
  const req = new Request("http://local/upload", { method: "POST", body: form });
  const contentType = req.headers.get("content-type")!;
  const body = Buffer.from(await req.arrayBuffer());
  return { body, contentType };
}

/** sci/kor 하나를 high 확신으로 실제 관찰·확정까지 왕복시킨다. */
async function observeHigh(
  app: App,
  token: string,
  server: Awaited<ReturnType<typeof testServer>>["server"],
  sci: string,
  kor: string,
) {
  app.mock.enqueue([{ scientificName: sci, vernacularName: kor, rank: "species", confidence: 0.92 }]);
  const { body, contentType } = await buildMultipartUpload([makeCleanJpeg()]);
  const upload = await server.inject({
    method: "POST",
    url: "/sightings/upload",
    headers: { authorization: `Bearer ${token}`, "content-type": contentType },
    payload: body,
  });
  const sightingId = upload.json().sighting_id as string;
  const identify = await server.inject({
    method: "POST",
    url: "/identify",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId },
  });
  const speciesId = identify.json().candidates[0].species_id as string;
  await server.inject({
    method: "POST",
    url: "/identify/confirm",
    headers: { authorization: `Bearer ${token}` },
    payload: { sighting_id: sightingId, species_id: speciesId },
  });
}

/** quest-winged-friends(날개 3종, reward xp=30, badgeId=badge-bug-friend) 완료. */
async function completeWingedFriendsQuest(app: App, token: string, server: Awaited<ReturnType<typeof testServer>>["server"]) {
  await observeHigh(app, token, server, "Pieris rapae", "배추흰나비");
  await observeHigh(app, token, server, "Harmonia axyridis", "무당벌레");
  await observeHigh(app, token, server, "Apis mellifera", "꿀벌");
}

test("GET /quests: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/quests" });
  assert.equal(res.statusCode, 401);
});

test("GET /quests: 관찰 전에는 전부 active, progress=0", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await server.inject({ method: "GET", url: "/quests", headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 200);
  const quests = res.json() as { quest_id: string; status: string; progress: number }[];
  assert.ok(quests.length >= 2);
  assert.ok(quests.every((q) => q.status === "active" && q.progress === 0));
});

test("퀘스트를 완료하면(3종 관찰) status=completed, 아직 XP는 안 오른다", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  await completeWingedFriendsQuest(app, token, server);

  const res = await server.inject({ method: "GET", url: "/quests", headers: { authorization: `Bearer ${token}` } });
  const quests = res.json() as { quest_id: string; status: string; progress: number; target: number }[];
  const winged = quests.find((q) => q.quest_id === "quest-winged-friends");
  assert.ok(winged);
  assert.equal(winged!.status, "completed");
  assert.equal(winged!.progress, 3);
  assert.equal(winged!.target, 3);
});

test("POST /quests/:id/claim: 완료된 퀘스트를 claim하면 XP가 오르고 status=claimed가 된다", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  await completeWingedFriendsQuest(app, token, server);

  const before = await server.inject({ method: "GET", url: "/profile/xp", headers: { authorization: `Bearer ${token}` } });
  const xpBefore = before.json().xp as number;

  const claim = await server.inject({
    method: "POST",
    url: "/quests/quest-winged-friends/claim",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.json().xp, xpBefore + 30, "quest-winged-friends.reward.xp=30");

  const res = await server.inject({ method: "GET", url: "/quests", headers: { authorization: `Bearer ${token}` } });
  const quests = res.json() as { quest_id: string; status: string }[];
  assert.equal(quests.find((q) => q.quest_id === "quest-winged-friends")!.status, "claimed");
});

test("퀘스트 claim은 연결된 배지를 unlocked로만 만든다(claimed는 별도)", async () => {
  const { app, server } = await testServer();
  const token = await signup(server);
  await completeWingedFriendsQuest(app, token, server);
  await server.inject({
    method: "POST",
    url: "/quests/quest-winged-friends/claim",
    headers: { authorization: `Bearer ${token}` },
  });

  const badgesRes = await server.inject({ method: "GET", url: "/badges", headers: { authorization: `Bearer ${token}` } });
  const badges = badgesRes.json() as { badge_id: string; unlocked: boolean; claimed: boolean }[];
  const bugFriend = badges.find((b) => b.badge_id === "badge-bug-friend");
  assert.equal(bugFriend!.unlocked, true);
  assert.equal(bugFriend!.claimed, false);
});

test("POST /quests/:id/claim: 완료 안 된 퀘스트는 400", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await server.inject({
    method: "POST",
    url: "/quests/quest-winged-friends/claim",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 400);
});

test("POST /quests/:id/claim: 존재하지 않는 퀘스트는 404", async () => {
  const { server } = await testServer();
  const token = await signup(server);
  const res = await server.inject({
    method: "POST",
    url: "/quests/no-such-quest/claim",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 404);
});
