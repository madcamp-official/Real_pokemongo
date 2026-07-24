/**
 * 골든 테스트: 인가 / 계정 격리 (체크리스트 §4.3 — CI 게이트).
 *
 * v1.2: 보호자·자녀 2단계 모델이 단일 계정으로 통합되면서 "childId만 바꾸면 남의 아이
 * 데이터 접근" IDOR 벡터 자체가 API 표면에서 사라졌다(ObserveRequest/DataRightsService
 * 어디에도 대상 id 파라미터가 없고 항상 ctx.userId만 쓴다 — 타입 수준의 방지).
 * 그래도 절대 약화해선 안 되는 불변식은 그대로 유지한다:
 *  - 위조/존재하지 않는 계정으로는 아무것도 할 수 없다(존재 검증이 다른 처리보다 먼저).
 *  - 계정 간 데이터는 절대 섞이지 않는다.
 *  - 정상 소유자는 전부 성공(과잉 차단 아님).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Authorizer, AuthorizationError, type AuthContext } from "./Authorization.js";
import { InMemoryUserRepo } from "../repositories/memory/InMemoryRepositories.js";
import { newUserId } from "../domain/ids.js";
import type { User, UserId } from "../domain/types.js";
import { buildApp } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { makeCleanJpeg } from "../media/fixtures.js";

function ctxOf(userId: UserId): AuthContext {
  return { userId };
}

// ── 단위 테스트: Authorizer ────────────────────────────────────────────────

function userOf(id: UserId): User {
  return {
    id,
    plan: "free",
    locationStorageEnabled: false,
    nickname: "탐험가",
    avatar: "fox",
    level: 1,
    xp: 0,
    createdAt: new Date().toISOString(),
  };
}

test("requireUser: 존재하는 계정은 통과하고 User를 돌려준다", async () => {
  const repo = new InMemoryUserRepo();
  const id = newUserId();
  await repo.save(userOf(id));
  const authz = new Authorizer(repo);

  const got = await authz.requireUser(ctxOf(id));
  assert.equal(got.id, id);
});

test("requireUser: 위조/존재하지 않는 계정은 AuthorizationError", async () => {
  const repo = new InMemoryUserRepo();
  const authz = new Authorizer(repo);

  await assert.rejects(
    () => authz.requireUser(ctxOf(newUserId())),
    AuthorizationError,
  );
});

test("assertOwns: 소유자 id가 일치하면 통과, 다르면 거부", () => {
  const authz = new Authorizer(new InMemoryUserRepo());
  const me = newUserId();
  const other = newUserId();
  assert.doesNotThrow(() => authz.assertOwns(ctxOf(me), me));
  assert.throws(() => authz.assertOwns(ctxOf(me), other), AuthorizationError);
});

// ── 통합 테스트: 두 계정(A/B) 격리 시나리오 ──────────────────────────────────

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  return cfg;
}

async function twoUsers() {
  const app = await buildApp(testConfig());
  const userA = await app.accounts.createUser({ nickname: "A", avatar: "fox" });
  const userB = await app.accounts.createUser({ nickname: "B", avatar: "bear" });
  const ctxA = ctxOf(userA.id);
  const ctxB = ctxOf(userB.id);
  return { app, userA, userB, ctxA, ctxB };
}

test("위조된 계정으로 관찰 시도 → 거부 + 외부 API 호출 0 + 미기록", async () => {
  const { app } = await twoUsers();
  const forgedCtx: AuthContext = { userId: newUserId() }; // 존재하지 않는 계정

  await assert.rejects(
    () =>
      app.flow.observe(forgedCtx, {
        images: [makeCleanJpeg()],
        media: [],
        groupHint: "plant",
      }),
    AuthorizationError,
  );

  // 인가가 '가장 먼저' 걸리므로 유료 동정 API는 호출되지 않아야 한다(비용 공격 차단).
  assert.equal(app.mock.identifyCalls, 0);
});

test("계정 간 데이터는 섞이지 않는다", async () => {
  const { app, ctxA, ctxB } = await twoUsers();

  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.93 },
  ]);
  await app.flow.observe(ctxA, { images: [makeCleanJpeg()], media: [], groupHint: "plant" });

  const obsA = await app.repos.observations.listByUser(ctxA.userId);
  const obsB = await app.repos.observations.listByUser(ctxB.userId);
  assert.equal(obsA.length, 1, "A의 관찰은 기록됨");
  assert.equal(obsB.length, 0, "B에게는 아무 영향 없음");
});

test("프라이버시 통제 탈취 방지: B의 설정은 A 계정에 영향이 없다", async () => {
  const { app, userA, ctxB } = await twoUsers();
  // B가 위치 저장을 켜도, 그것은 B 계정에만 적용된다(대상 계정을 지정할 방법이 없음).
  await app.accounts.setLocationStorage(ctxB, true);

  const freshA = await app.accounts.getUser(userA.id);
  assert.equal(freshA!.locationStorageEnabled, false, "A의 위치 저장은 여전히 OFF여야 함");
});

test("정상 소유자는 모든 접근이 성공한다(과잉 차단 아님)", async () => {
  const { app, ctxA, userA } = await twoUsers();

  const self = await app.accounts.getSelf(ctxA);
  assert.equal(self.id, userA.id);

  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.93 },
  ]);
  const res = await app.flow.observe(ctxA, {
    images: [makeCleanJpeg()],
    media: [],
    groupHint: "plant",
  });
  assert.ok(res.recorded, "소유자의 관찰은 정상 기록되어야 함");
});
