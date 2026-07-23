/**
 * 골든 테스트: 데이터 주체 권리 (체크리스트 §5.6 [치명] / §4.2 프라이버시 — CI 게이트).
 *
 * 회귀하면 "삭제했다는데 데이터가 남는" 법 위반 사고가 난다. 절대 약화 금지.
 * 핵심 불변식:
 *  - 삭제 후 그 아이의 데이터가 **모든 저장소에서 0건**(삭제 완전성).
 *  - 형제·남의 가족 데이터는 절대 지워지지 않음(과잉 삭제 방지).
 *  - 삭제/내보내기는 본인 가족만(IDOR 방지) — 남의 아이는 AuthorizationError.
 *  - 파기 리포트가 실제 삭제 건수를 정확히 보고.
 *  - 미디어 blob 파기 대상(MediaRef)이 리포트에 수집됨.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { AuthorizationError, type AuthContext } from "../../core/auth/Authorization.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";
import { asMediaRef } from "../../core/domain/ids.js";
import type { ChildId, GuardianId } from "../../core/domain/types.js";

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  return cfg;
}

/** 한 아이가 관찰을 여러 번 해서 모든 저장소에 데이터를 쌓는다. */
async function observe(app: App, ctx: AuthContext, childId: ChildId, sci: string, kor: string) {
  app.mock.enqueue([{ scientificName: sci, vernacularName: kor, rank: "species", confidence: 0.92 }]);
  return app.flow.observe(ctx, {
    childId,
    images: [makeCleanJpeg()],
    media: [asMediaRef("media://" + sci)],
    groupHint: "plant",
  });
}

async function seedChildWithData(app: App, ctx: AuthContext, childId: ChildId) {
  await observe(app, ctx, childId, "Taraxacum officinale", "민들레");
  await observe(app, ctx, childId, "Forsythia koreana", "개나리");
}

/** 그 아이의 데이터가 모든 저장소에 몇 건씩 있는지. */
async function footprint(app: App, childId: ChildId) {
  return {
    child: await app.repos.children.get(childId),
    observations: (await app.repos.observations.listByChild(childId)).length,
    collection: (await app.repos.collection.listByChild(childId)).length,
    questProgress: (await app.repos.quests.listProgressByChild(childId)).length,
    badges: (await app.repos.badges.listByChild(childId)).length,
  };
}

async function twoChildFamily() {
  const app = await buildApp(testConfig());
  const g = await app.accounts.createGuardian("free");
  const ctx: AuthContext = { guardianId: g.id };
  const childA = await app.accounts.createChild(ctx, {
    nickname: "첫째",
    ageBand: "child",
    avatar: "fox",
    legalGuardianConsent: true,
  });
  const childB = await app.accounts.createChild(ctx, {
    nickname: "둘째",
    ageBand: "child",
    avatar: "bear",
    legalGuardianConsent: true,
  });
  return { app, g, ctx, childA, childB };
}

test("삭제 완전성: 아이 데이터가 모든 저장소에서 0건이 된다", async () => {
  const { app, ctx, childA } = await twoChildFamily();
  await seedChildWithData(app, ctx, childA.id);

  // 사전 조건: 데이터가 실제로 쌓였는지.
  const before = await footprint(app, childA.id);
  assert.ok(before.observations >= 2 && before.collection >= 2 && before.badges >= 1);

  const report = await app.dataRights.eraseChildData(ctx, childA.id);

  const after = await footprint(app, childA.id);
  assert.equal(after.child, null, "프로필이 남으면 안 됨");
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

test("과잉 삭제 방지: 형제 데이터는 절대 지워지지 않는다", async () => {
  const { app, ctx, childA, childB } = await twoChildFamily();
  await seedChildWithData(app, ctx, childA.id);
  await seedChildWithData(app, ctx, childB.id);

  await app.dataRights.eraseChildData(ctx, childA.id);

  // 형제(B)의 데이터는 온전해야 한다.
  const b = await footprint(app, childB.id);
  assert.ok(b.child, "형제 프로필은 유지");
  assert.ok(b.observations >= 2, "형제 관찰 유지");
  assert.ok(b.collection >= 2, "형제 도감 유지");
});

test("IDOR: 남의 아이는 삭제도 내보내기도 할 수 없다", async () => {
  const { app, childA } = await twoChildFamily();
  const attacker = await app.accounts.createGuardian("free");
  const attackerCtx: AuthContext = { guardianId: attacker.id };

  await assert.rejects(
    () => app.dataRights.eraseChildData(attackerCtx, childA.id),
    AuthorizationError,
  );
  await assert.rejects(
    () => app.dataRights.exportChildData(attackerCtx, childA.id),
    AuthorizationError,
  );
  // A의 프로필은 그대로.
  assert.ok(await app.repos.children.get(childA.id));
});

test("회원 탈퇴: 보호자와 소속 자녀 전원 데이터가 파기된다", async () => {
  const { app, g, ctx, childA, childB } = await twoChildFamily();
  await seedChildWithData(app, ctx, childA.id);
  await seedChildWithData(app, ctx, childB.id);

  const report = await app.dataRights.eraseGuardianAccount(ctx);

  assert.equal(report.children.length, 2, "자녀 2명 모두 파기 리포트");
  assert.equal(report.guardianDeleted, true);
  assert.equal(await app.repos.guardians.get(g.id), null, "보호자 계정 파기");
  assert.equal((await footprint(app, childA.id)).child, null);
  assert.equal((await footprint(app, childB.id)).child, null);
  assert.equal((await footprint(app, childA.id)).observations, 0);
});

test("이동권: 내보내기는 아동 데이터 사본을 반환하되 정밀 좌표는 없다", async () => {
  const { app, ctx, childA } = await twoChildFamily();
  await seedChildWithData(app, ctx, childA.id);

  const dump = await app.dataRights.exportChildData(ctx, childA.id);
  assert.equal(dump.profile.nickname, "첫째");
  assert.ok(dump.observations.length >= 2);
  assert.ok(dump.collection.length >= 2);
  // 내보낸 관찰에 정밀 좌표가 없어야 한다(프라이버시 유지).
  assert.equal(JSON.stringify(dump).includes('"lat"'), false);
  assert.equal(JSON.stringify(dump).includes('"lng"'), false);
});

test("파기 후 재호출은 인가 단계에서 거부된다(프로필 부재)", async () => {
  const { app, ctx, childA } = await twoChildFamily();
  await seedChildWithData(app, ctx, childA.id);
  await app.dataRights.eraseChildData(ctx, childA.id);

  // 이미 지워진 아이 → 소유권 검증이 미존재로 거부(안전하게 실패).
  await assert.rejects(
    () => app.dataRights.eraseChildData(ctx, childA.id),
    AuthorizationError,
  );
});
