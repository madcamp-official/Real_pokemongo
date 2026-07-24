/**
 * 골든 테스트: 인가 / IDOR 방지 (체크리스트 §4.3 — CI 게이트).
 *
 * 회귀하면 "childId만 바꾸면 남의 아이 데이터 접근"이 뚫린다. 절대 약화 금지.
 * 핵심 불변식:
 *  - 남의 자녀/계정 접근은 AuthorizationError.
 *  - 미존재와 소유 불일치는 '같은' 에러(자원 존재 여부 누설 방지).
 *  - IDOR 시도는 외부 동정 API 호출 0(비용 공격 차단)이고 아무것도 기록하지 않는다.
 *  - 정상 소유자는 전부 성공.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Authorizer, AuthorizationError, type AuthContext } from "./Authorization.js";
import { InMemoryChildRepo } from "../repositories/memory/InMemoryRepositories.js";
import { newChildId, newGuardianId } from "../domain/ids.js";
import type { ChildProfile, GuardianId } from "../domain/types.js";
import { buildApp } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { makeCleanJpeg } from "../media/fixtures.js";

function ctxOf(guardianId: GuardianId): AuthContext {
  return { guardianId };
}

// ── 단위 테스트: Authorizer ────────────────────────────────────────────────

function childOf(guardianId: GuardianId): ChildProfile {
  return {
    id: newChildId(),
    guardianId,
    nickname: "아이",
    ageBand: "child",
    avatar: "fox",
    level: 1,
    xp: 0,
    createdAt: new Date().toISOString(),
  };
}

test("assertOwnsChild: 소유자는 통과하고 ChildProfile을 돌려준다", async () => {
  const repo = new InMemoryChildRepo();
  const owner = newGuardianId();
  const child = childOf(owner);
  await repo.save(child);
  const authz = new Authorizer(repo);

  const got = await authz.assertOwnsChild(ctxOf(owner), child.id);
  assert.equal(got.id, child.id);
});

test("assertOwnsChild: 남의 아이와 미존재 아이는 '같은' 에러(존재 여부 누설 방지)", async () => {
  const repo = new InMemoryChildRepo();
  const owner = newGuardianId();
  const attacker = newGuardianId();
  const child = childOf(owner);
  await repo.save(child);
  const authz = new Authorizer(repo);

  // 남의 아이
  await assert.rejects(
    () => authz.assertOwnsChild(ctxOf(attacker), child.id),
    AuthorizationError,
  );
  // 존재하지 않는 아이 — 동일한 에러 타입이어야 한다.
  await assert.rejects(
    () => authz.assertOwnsChild(ctxOf(attacker), newChildId()),
    AuthorizationError,
  );
});

test("assertSelf: 본인만 통과, 남은 거부", () => {
  const authz = new Authorizer(new InMemoryChildRepo());
  const me = newGuardianId();
  const other = newGuardianId();
  assert.doesNotThrow(() => authz.assertSelf(ctxOf(me), me));
  assert.throws(() => authz.assertSelf(ctxOf(me), other), AuthorizationError);
});

// ── 통합 테스트: 두 가족(A/B) IDOR 시나리오 ──────────────────────────────────

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  return cfg;
}

async function twoFamilies() {
  const app = await buildApp(testConfig());
  const gA = await app.accounts.createGuardian("free");
  const gB = await app.accounts.createGuardian("free");
  const ctxA = ctxOf(gA.id);
  const ctxB = ctxOf(gB.id);
  const childA = await app.accounts.createChild(ctxA, {
    nickname: "A네아이",
    ageBand: "child",
    avatar: "fox",
    legalGuardianConsent: true,
  });
  return { app, gA, gB, ctxA, ctxB, childA };
}

test("IDOR: 남의 아이로 관찰 시도 → 거부 + 외부 API 호출 0 + 미기록", async () => {
  const { app, ctxB, childA } = await twoFamilies();

  await assert.rejects(
    () =>
      app.flow.observe(ctxB, {
        childId: childA.id,
        images: [makeCleanJpeg()],
        media: [],
        groupHint: "plant",
      }),
    AuthorizationError,
  );

  // 인가가 '가장 먼저' 걸리므로 유료 동정 API는 호출되지 않아야 한다(비용 공격 차단).
  assert.equal(app.mock.identifyCalls, 0);
  // A의 아이에게 아무 관찰도 기록되지 않아야 한다.
  const obs = await app.repos.observations.listByChild(childA.id);
  assert.equal(obs.length, 0);
});

test("IDOR: 남의 아이 프로필 조회 → 거부", async () => {
  const { app, ctxB, childA } = await twoFamilies();
  await assert.rejects(
    () => app.accounts.getChildAuthorized(ctxB, childA.id),
    AuthorizationError,
  );
});

test("프라이버시 통제 탈취 방지: B의 설정은 A 계정에 영향이 없다", async () => {
  const { app, gA, ctxB } = await twoFamilies();
  // B가 위치 저장을 켜도, 그것은 B 계정에만 적용된다(대상 계정을 지정할 방법이 없음).
  await app.accounts.setLocationStorage(ctxB, true);

  const freshA = await app.accounts.getGuardian(gA.id);
  assert.equal(freshA!.locationStorageEnabled, false, "A의 위치 저장은 여전히 OFF여야 함");
});

test("대시보드는 인증된 본인의 가족만 반환한다", async () => {
  const { app, ctxA, ctxB } = await twoFamilies();
  const viewA = await app.dashboard.build(ctxA);
  const viewB = await app.dashboard.build(ctxB);
  assert.equal(viewA.children.length, 1);
  assert.equal(viewB.children.length, 0, "B는 자녀가 없으므로 빈 목록");
});

test("정상 소유자는 모든 접근이 성공한다(과잉 차단 아님)", async () => {
  const { app, ctxA, childA } = await twoFamilies();

  const child = await app.accounts.getChildAuthorized(ctxA, childA.id);
  assert.equal(child.id, childA.id);

  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.93 },
  ]);
  const res = await app.flow.observe(ctxA, {
    childId: childA.id,
    images: [makeCleanJpeg()],
    media: [],
    groupHint: "plant",
  });
  assert.ok(res.recorded, "소유자의 관찰은 정상 기록되어야 함");
});
