/**
 * 골든 테스트: 관찰 플로우 통합 (체크리스트 §4.4/§4.5/§4.6/§4.2).
 *
 * 검증하는 불변식:
 *  - high 확신만 도감·퀘스트·보상에 반영. medium/unknown은 반영 안 됨(오동정 굳힘 방지).
 *  - 위험 종도 도감에는 수집되되 안전 안내가 먼저.
 *  - 재관찰은 중복 해금/중복 배지를 만들지 않음(멱등성).
 *  - 일일 한도 초과 시 외부 동정 API를 '호출하지 않고' 차단(비용 안전).
 *  - D단계 제품 결정: 정밀 좌표(preciseCoord)는 위치 저장 동의(locationStorageEnabled)와
 *    무관하게 항상 저장된다. region(일반화 값)은 여전히 동의 게이트를 그대로 따른다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp, type App } from "../composition.js";
import { loadConfig, type AppConfig } from "../config/index.js";
import type { AuthContext } from "../core/auth/Authorization.js";
import { makeCleanJpeg, makeJpegWithGpsExif } from "../core/media/fixtures.js";

function testConfig(freeDailyLimit = 0): AppConfig {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  // 실제 키가 환경에 있어도 테스트는 항상 Mock으로 돌게 강제.
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = freeDailyLimit;
  return cfg;
}

async function setup(freeDailyLimit = 0) {
  const app = await buildApp(testConfig(freeDailyLimit));
  const user = await app.accounts.createUser({ nickname: "테스트유저", avatar: "fox" });
  const ctx: AuthContext = { userId: user.id }; // 인증된 계정 컨텍스트
  return { app, ctx, user };
}

function img() {
  // 원시 이미지(플로우 내부에서 정화됨). 정화기의 미지 포맷 거부 정책상 유효 JPEG 여야 함.
  return [makeCleanJpeg()];
}

async function observeHigh(
  app: App,
  ctx: AuthContext,
  sci: string,
  kor: string,
  group: "plant" | "insect",
  extra?: { rawCoord?: { lat: number; lng: number } },
) {
  app.mock.enqueue([{ scientificName: sci, vernacularName: kor, rank: "species", confidence: 0.92 }]);
  return app.flow.observe(ctx, {
    images: img(),
    media: [],
    groupHint: group,
    rawCoord: extra?.rawCoord,
  });
}

test("high 확신은 도감·퀘스트·보상에 반영된다", async () => {
  const { app, ctx } = await setup();
  const res = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant");

  assert.ok(res.recorded, "high 확신은 기록되어야 함");
  assert.equal(res.recorded!.newlyUnlockedTaxonId, "taxon-dandelion");
  assert.ok(res.recorded!.collectionRatio > 0);
  assert.ok(res.recorded!.xpGained > 0);

  // 봄 퀘스트(노란 꽃) 진행이 1 올라야 한다(민들레=노란 봄 식물).
  const progress = await app.repos.quests.getProgress(ctx.userId, "quest-spring-yellow-flowers");
  assert.ok(progress);
  assert.equal(progress!.matchedTaxonIds.length, 1);
});

test("medium 확신은 도감/퀘스트에 반영되지 않는다(오동정 굳힘 방지)", async () => {
  const { app, ctx } = await setup();
  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.72 },
    { scientificName: "Forsythia koreana", vernacularName: "개나리", rank: "species", confidence: 0.66 },
  ]);
  const res = await app.flow.observe(ctx, { images: img(), media: [], groupHint: "plant" });

  assert.equal(res.identification.tier, "medium");
  assert.equal(res.recorded, undefined, "medium은 기록되면 안 됨");

  const entries = await app.repos.collection.listByUser(ctx.userId);
  assert.equal(entries.length, 0, "도감에 해금이 없어야 함");
});

test("unknown 확신은 재촬영 안내만 하고 아무것도 기록하지 않는다", async () => {
  const { app, ctx } = await setup();
  app.mock.enqueue([{ scientificName: "Nothing here", rank: "species", confidence: 0.2 }]);
  const res = await app.flow.observe(ctx, { images: img(), media: [], groupHint: "plant" });

  assert.equal(res.identification.tier, "unknown");
  assert.equal(res.recorded, undefined);
  const obs = await app.repos.observations.listByUser(ctx.userId);
  assert.equal(obs.length, 0);
});

test("위험 종도 도감에는 수집되되, 안전 안내가 먼저 노출된다", async () => {
  const { app, ctx } = await setup();
  const res = await observeHigh(app, ctx, "Apis mellifera", "꿀벌", "insect");

  assert.ok(res.recorded, "위험 종도 도감엔 수집됨");
  assert.ok(res.safety, "안전 안내가 있어야 함");
  assert.equal(res.safety!.showFirst, true);
  assert.equal(res.identification.childMessage, res.safety!.message);
});

test("재관찰은 중복 해금·중복 배지를 만들지 않는다(멱등성)", async () => {
  const { app, ctx } = await setup();
  const first = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant");
  const second = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant");

  assert.equal(first.recorded!.newlyUnlockedTaxonId, "taxon-dandelion");
  assert.equal(second.recorded!.newlyUnlockedTaxonId, undefined, "이미 해금된 종은 다시 해금되지 않음");

  // '첫 발견' 배지는 한 번만.
  const badges = await app.repos.badges.listByUser(ctx.userId);
  const firstFind = badges.filter((b) => b.badgeId === "badge-first-find");
  assert.equal(firstFind.length, 1);

  // XP: 첫 해금 +10, 재관찰 +2 → 누적 12.
  const fresh = await app.accounts.getUser(ctx.userId);
  assert.equal(fresh!.xp, 12);

  // D단계: 개체도 첫 해금 때만 1마리 생성되고, 재관찰로 추가 생성되지 않는다(종당 최대 1마리).
  const creatures = await app.repos.creatures.listByUser(ctx.userId);
  const dandelionCreatures = creatures.filter((c) => c.taxonId === "taxon-dandelion");
  assert.equal(dandelionCreatures.length, 1, "재관찰해도 개체는 여전히 1마리여야 함");
});

test("일일 한도 초과 시 외부 동정 API를 호출하지 않고 차단한다(비용 안전)", async () => {
  const { app, ctx } = await setup(1); // 무료 일일 한도 1

  const ok = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant");
  assert.ok(ok.recorded, "첫 관찰은 성공");
  assert.equal(app.mock.identifyCalls, 1);

  // 두 번째: 한도 초과 → 동정 자체를 시도하지 않아야 함(호출 카운트 불변).
  const blocked = await app.flow.observe(ctx, { images: img(), media: [], groupHint: "plant" });
  assert.equal(blocked.blocked?.reason, "daily_limit");
  assert.equal(app.mock.identifyCalls, 1, "차단 시 외부 API가 호출되면 안 됨(비용 발생)");
});

test("정밀 좌표는 위치 저장 동의(OFF)와 무관하게 항상 저장된다(region만 동의 게이트)", async () => {
  const { app, ctx } = await setup();
  const res = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant", {
    rawCoord: { lat: 37.512345, lng: 127.056789 },
  });
  const obs = await app.repos.observations.get(res.recorded!.observationId as never);
  assert.equal(obs!.region, null, "위치 OFF면 region(일반화 값)은 여전히 null");
  assert.deepEqual(
    obs!.preciseCoord,
    { lat: 37.512345, lng: 127.056789 },
    "정밀 좌표는 동의 여부와 무관하게 저장돼야 함(D단계 제품 결정)",
  );
});

test("좌표를 안 주면 preciseCoord도 null이다(있는 것만 저장, 지어내지 않음)", async () => {
  const { app, ctx } = await setup();
  const res = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant");
  const obs = await app.repos.observations.get(res.recorded!.observationId as never);
  assert.equal(obs!.preciseCoord, null);
});

test("GPS EXIF 사진을 올려도 외부 동정 API에는 EXIF 없는 바이트만 전달된다", async () => {
  const { app, ctx } = await setup();
  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.93 },
  ]);
  await app.flow.observe(ctx, {
    images: [makeJpegWithGpsExif()], // GPS가 박힌 원시 사진
    media: [],
    groupHint: "plant",
  });

  // 프로바이더(=외부 전송 직전)가 받은 바이트에 EXIF/좌표가 없어야 한다.
  const received = app.mock.lastInput!.images;
  const bytes = received[0]!;
  const hasSeq = (needle: number[]) => {
    outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
      for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
      return true;
    }
    return false;
  };
  const a = (s: string) => [...s].map((c) => c.charCodeAt(0));
  assert.equal(hasSeq(a("Exif")), false, "외부로 나가는 바이트에 EXIF가 없어야 함");
  assert.equal(hasSeq(a("GPS37.512345")), false, "외부로 나가는 바이트에 좌표가 없어야 함");
});

test("위치 저장 ON이면 region(일반화 값)도 함께 채워지고, 정밀 좌표도 여전히 저장된다", async () => {
  const { app, ctx } = await setup();
  await app.accounts.setLocationStorage(ctx, true);

  const res = await observeHigh(app, ctx, "Taraxacum officinale", "민들레", "plant", {
    rawCoord: { lat: 37.512345, lng: 127.056789 },
  });
  const obs = await app.repos.observations.get(res.recorded!.observationId as never);
  assert.ok(obs!.region, "위치 ON이면 region이 있어야 함");
  assert.ok(obs!.region!.regionCode.length > 0);
  assert.deepEqual(obs!.preciseCoord, { lat: 37.512345, lng: 127.056789 });
});
