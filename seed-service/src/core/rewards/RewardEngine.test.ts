/**
 * 골든 테스트: 보상 Claim 흐름 (D단계 제품 결정).
 *
 * 검증하는 불변식:
 *  - 관찰 자체의 기본 XP는 여전히 즉시 자동 지급(변경 없음).
 *  - 퀘스트 완료는 XP를 자동으로 안 주고, claimQuest를 호출해야만 지급된다.
 *  - 퀘스트 claim이 연결된 배지를 "해금"만 한다(claimed는 아님) — 그 배지의 XP는
 *    별도로 claimBadge해야 들어온다.
 *  - 규칙(rule) 기반으로 자동 해금된 배지도 XP는 claim 전까지 안 들어온다.
 *  - 이미 claim한 것을 다시 claim하면 거부된다(중복 지급 방지).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import type { AuthContext } from "../auth/Authorization.js";
import { makeCleanJpeg } from "../media/fixtures.js";
import { ClaimError } from "./RewardEngine.js";

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  return cfg;
}

async function setup() {
  const app = await buildApp(testConfig());
  const user = await app.accounts.createUser({ nickname: "테스트유저", avatar: "fox" });
  const ctx: AuthContext = { userId: user.id };
  return { app, ctx };
}

async function observeHigh(app: App, ctx: AuthContext, sci: string, kor: string) {
  app.mock.enqueue([{ scientificName: sci, vernacularName: kor, rank: "species", confidence: 0.92 }]);
  return app.flow.observe(ctx, {
    images: [makeCleanJpeg()],
    media: [],
    groupHint: "insect",
  });
}

/** quest-winged-friends(날개 3종, reward xp=30, badgeId=badge-bug-friend)를 완료시킨다. */
async function completeWingedFriendsQuest(app: App, ctx: AuthContext) {
  await observeHigh(app, ctx, "Pieris rapae", "배추흰나비");
  await observeHigh(app, ctx, "Harmonia axyridis", "무당벌레");
  const res = await observeHigh(app, ctx, "Apis mellifera", "꿀벌");
  return res;
}

test("퀘스트 완료 직후엔 보상 XP가 안 오르고, claimQuest 호출 후에야 오른다", async () => {
  const { app, ctx } = await setup();
  const res = await completeWingedFriendsQuest(app, ctx);

  assert.ok(
    res.recorded!.completedQuestTitles.includes("날개 달린 친구 3종 🦋"),
    "퀘스트가 완료로 기록돼야 함",
  );

  const beforeClaim = await app.accounts.getUser(ctx.userId);
  const xpBeforeClaim = beforeClaim!.xp;

  const outcome = await app.repos.quests.getProgress(ctx.userId, "quest-winged-friends");
  assert.equal(outcome!.completed, true);
  assert.equal(outcome!.claimedAt, undefined, "완료됐지만 아직 claim 전");

  await app.rewards.claimQuest(ctx.userId, "quest-winged-friends");

  const afterClaim = await app.accounts.getUser(ctx.userId);
  assert.equal(afterClaim!.xp, xpBeforeClaim + 30, "퀘스트 reward.xp(30)만큼만 늘어야 함");

  const progressAfter = await app.repos.quests.getProgress(ctx.userId, "quest-winged-friends");
  assert.ok(progressAfter!.claimedAt, "claim 후엔 claimedAt이 채워져야 함");
});

test("퀘스트 claim은 연결된 배지를 unlocked로만 만들고 claimed로는 안 만든다", async () => {
  const { app, ctx } = await setup();
  await completeWingedFriendsQuest(app, ctx);

  await app.rewards.claimQuest(ctx.userId, "quest-winged-friends");

  const badge = await app.repos.badges.get(ctx.userId, "badge-bug-friend");
  assert.ok(badge, "quest reward.badgeId로 지정된 배지가 해금돼야 함");
  assert.equal(badge!.claimedAt, undefined, "배지 자체는 아직 claim 전이어야 함");

  const xpAfterQuestClaim = (await app.accounts.getUser(ctx.userId))!.xp;

  // 배지(badge-bug-friend.xp=15)는 별도로 claim해야 지급된다.
  await app.rewards.claimBadge(ctx.userId, "badge-bug-friend");
  const xpAfterBadgeClaim = (await app.accounts.getUser(ctx.userId))!.xp;
  assert.equal(xpAfterBadgeClaim, xpAfterQuestClaim + 15);

  const badgeAfter = await app.repos.badges.get(ctx.userId, "badge-bug-friend");
  assert.ok(badgeAfter!.claimedAt, "이제는 claim됨");
});

test("규칙 기반으로 자동 해금된 배지도 XP는 claim 전까지 안 들어온다", async () => {
  const { app, ctx } = await setup();
  const res = await observeHigh(app, ctx, "Pieris rapae", "배추흰나비"); // 첫 관찰

  assert.ok(
    res.recorded!.newBadgeTitles.includes("첫 발견!"),
    "첫 관찰이면 규칙 기반으로 badge-first-find가 해금돼야 함",
  );

  const badge = await app.repos.badges.get(ctx.userId, "badge-first-find");
  assert.ok(badge, "해금(존재)은 됐어야 함");
  assert.equal(badge!.claimedAt, undefined, "아직 claim 전");

  const xpBefore = (await app.accounts.getUser(ctx.userId))!.xp;
  await app.rewards.claimBadge(ctx.userId, "badge-first-find");
  const xpAfter = (await app.accounts.getUser(ctx.userId))!.xp;
  assert.equal(xpAfter, xpBefore + 5, "badge-first-find.xp=5만큼 늘어야 함");
});

test("완료 안 된 퀘스트는 claim할 수 없다(not_completed)", async () => {
  const { app, ctx } = await setup();
  await observeHigh(app, ctx, "Pieris rapae", "배추흰나비"); // 1/3만 진행, 미완료

  await assert.rejects(
    () => app.rewards.claimQuest(ctx.userId, "quest-winged-friends"),
    (err: unknown) => err instanceof ClaimError && err.reason === "not_completed",
  );
});

test("이미 claim한 퀘스트를 다시 claim하면 거부된다(중복 지급 방지)", async () => {
  const { app, ctx } = await setup();
  await completeWingedFriendsQuest(app, ctx);
  await app.rewards.claimQuest(ctx.userId, "quest-winged-friends");

  await assert.rejects(
    () => app.rewards.claimQuest(ctx.userId, "quest-winged-friends"),
    (err: unknown) => err instanceof ClaimError && err.reason === "already_claimed",
  );
});

test("이미 claim한 배지를 다시 claim하면 거부된다", async () => {
  const { app, ctx } = await setup();
  await observeHigh(app, ctx, "Pieris rapae", "배추흰나비");
  await app.rewards.claimBadge(ctx.userId, "badge-first-find");

  await assert.rejects(
    () => app.rewards.claimBadge(ctx.userId, "badge-first-find"),
    (err: unknown) => err instanceof ClaimError && err.reason === "already_claimed",
  );
});

test("존재하지 않는 퀘스트/배지 claim은 not_found로 거부된다", async () => {
  const { app, ctx } = await setup();
  await assert.rejects(
    () => app.rewards.claimQuest(ctx.userId, "quest-does-not-exist"),
    (err: unknown) => err instanceof ClaimError && err.reason === "not_found",
  );
  await assert.rejects(
    () => app.rewards.claimBadge(ctx.userId, "badge-does-not-exist"),
    (err: unknown) => err instanceof ClaimError && err.reason === "not_found",
  );
});

test("아직 해금되지 않은 배지는 claim할 수 없다(not_found)", async () => {
  const { app, ctx } = await setup();
  await assert.rejects(
    () => app.rewards.claimBadge(ctx.userId, "badge-bug-master"), // 조건 미충족, 해금 안 됨
    (err: unknown) => err instanceof ClaimError && err.reason === "not_found",
  );
});
