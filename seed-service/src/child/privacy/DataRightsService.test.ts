/**
 * 골든 테스트: 데이터 주체 권리 (체크리스트 §5.6 [치명] / §4.2 프라이버시 — CI 게이트).
 *
 * 회귀하면 "삭제했다는데 데이터가 남는" 법 위반 사고가 난다. 절대 약화 금지.
 * 핵심 불변식:
 *  - 삭제 후 내 계정 데이터가 **모든 저장소에서 0건**(삭제 완전성).
 *  - 다른 계정 데이터는 절대 지워지지 않음(과잉 삭제 방지).
 *  - 삭제/내보내기는 항상 ctx.userId 자신만 대상(대상 id를 별도로 받지 않으므로 IDOR
 *    자체가 API 표면에서 성립하지 않는다 — v1.2 단일 계정 모델로 통합되며 바뀐 부분).
 *    다만 위조/존재하지 않는 계정으로는 아무것도 할 수 없어야 한다.
 *  - 파기 리포트가 실제 삭제 건수를 정확히 보고.
 *  - 미디어 blob 파기 대상(MediaRef)이 리포트에 수집됨.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { AuthorizationError, type AuthContext } from "../../core/auth/Authorization.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";
import { asMediaRef, newUserId } from "../../core/domain/ids.js";

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  return cfg;
}

/** 한 계정이 관찰을 여러 번 해서 모든 저장소에 데이터를 쌓는다. */
async function observe(app: App, ctx: AuthContext, sci: string, kor: string) {
  app.mock.enqueue([{ scientificName: sci, vernacularName: kor, rank: "species", confidence: 0.92 }]);
  return app.flow.observe(ctx, {
    images: [makeCleanJpeg()],
    media: [asMediaRef("media://" + sci)],
    groupHint: "plant",
  });
}

async function seedUserWithData(app: App, ctx: AuthContext) {
  await observe(app, ctx, "Taraxacum officinale", "민들레");
  await observe(app, ctx, "Forsythia koreana", "개나리");
}

/** 그 계정의 데이터가 모든 저장소에 몇 건씩 있는지. */
async function footprint(app: App, userId: AuthContext["userId"]) {
  return {
    user: await app.repos.users.get(userId),
    observations: (await app.repos.observations.listByUser(userId)).length,
    collection: (await app.repos.collection.listByUser(userId)).length,
    questProgress: (await app.repos.quests.listProgressByUser(userId)).length,
    badges: (await app.repos.badges.listByUser(userId)).length,
  };
}

async function oneUser(nickname = "첫째") {
  const app = await buildApp(testConfig());
  const user = await app.accounts.createUser({ nickname, avatar: "fox" });
  const ctx: AuthContext = { userId: user.id };
  return { app, user, ctx };
}

test("삭제 완전성: 회원 탈퇴 시 내 계정 데이터가 모든 저장소에서 0건이 된다", async () => {
  const { app, ctx } = await oneUser();
  await seedUserWithData(app, ctx);

  // 사전 조건: 데이터가 실제로 쌓였는지.
  const before = await footprint(app, ctx.userId);
  assert.ok(before.observations >= 2 && before.collection >= 2 && before.badges >= 1);

  const report = await app.dataRights.eraseUserData(ctx);

  const after = await footprint(app, ctx.userId);
  assert.equal(after.user, null, "프로필이 남으면 안 됨");
  assert.equal(after.observations, 0);
  assert.equal(after.collection, 0);
  assert.equal(after.questProgress, 0);
  assert.equal(after.badges, 0);

  // 리포트가 실제 삭제 건수를 정확히 보고.
  assert.equal(report.deleted.observations, before.observations);
  assert.equal(report.deleted.badges, before.badges);
  assert.equal(report.deleted.profile, true);
  // 미디어 blob 파기 대상이 수집됨.
  assert.equal(report.mediaRefsToPurge.length, before.observations);
});

test("과잉 삭제 방지: 다른 계정 데이터는 절대 지워지지 않는다", async () => {
  const { app, ctx: ctxA } = await oneUser("첫째");
  const userB = await app.accounts.createUser({ nickname: "둘째", avatar: "bear" });
  const ctxB: AuthContext = { userId: userB.id };

  await seedUserWithData(app, ctxA);
  await seedUserWithData(app, ctxB);

  await app.dataRights.eraseUserData(ctxA);

  // 다른 계정(B)의 데이터는 온전해야 한다.
  const b = await footprint(app, ctxB.userId);
  assert.ok(b.user, "다른 계정 프로필은 유지");
  assert.ok(b.observations >= 2, "다른 계정 관찰 유지");
  assert.ok(b.collection >= 2, "다른 계정 도감 유지");
});

test("위조된 계정으로는 삭제도 내보내기도 할 수 없다", async () => {
  const { app } = await oneUser();
  const forgedCtx: AuthContext = { userId: newUserId() }; // 존재하지 않는 계정

  await assert.rejects(
    () => app.dataRights.eraseUserData(forgedCtx),
    AuthorizationError,
  );
  await assert.rejects(
    () => app.dataRights.exportUserData(forgedCtx),
    AuthorizationError,
  );
});

test("이동권: 내보내기는 내 데이터 사본을 반환하되 정밀 좌표는 없다", async () => {
  const { app, ctx } = await oneUser("첫째");
  await seedUserWithData(app, ctx);

  const dump = await app.dataRights.exportUserData(ctx);
  assert.equal(dump.profile.nickname, "첫째");
  assert.ok(dump.observations.length >= 2);
  assert.ok(dump.collection.length >= 2);
  // 내보낸 관찰에 정밀 좌표가 없어야 한다(프라이버시 유지).
  assert.equal(JSON.stringify(dump).includes('"lat"'), false);
  assert.equal(JSON.stringify(dump).includes('"lng"'), false);
});

test("파기 후 재호출은 인가 단계에서 거부된다(프로필 부재)", async () => {
  const { app, ctx } = await oneUser();
  await seedUserWithData(app, ctx);
  await app.dataRights.eraseUserData(ctx);

  // 이미 지워진 계정 → 소유권 검증이 미존재로 거부(안전하게 실패).
  await assert.rejects(
    () => app.dataRights.eraseUserData(ctx),
    AuthorizationError,
  );
});
