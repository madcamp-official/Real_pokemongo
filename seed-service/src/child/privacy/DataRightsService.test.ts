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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp, type App } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { AuthorizationError, type AuthContext } from "../../core/auth/Authorization.js";
import { makeCleanJpeg } from "../../core/media/fixtures.js";
import { makeRealAudio } from "../../core/audio/fixtures.js";
import { asMediaRef, newUserId } from "../../core/domain/ids.js";

function testConfig() {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  cfg.audio.tempDir = join(tmpdir(), `seed-service-audio-datarights-${randomUUID()}`);
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
  await observe(app, ctx, "Commelina communis", "닭의장풀");
  // F16 홈가든: 개체가 이미 생겼으니(위 관찰들로 자동 생성) 정원에도 배치해 저장소를 채운다.
  const creatures = await app.repos.creatures.listByUser(ctx.userId);
  await app.repos.garden.saveLayout(ctx.userId, {
    tiles: [{ row: 0, col: 0, type: "grass" }],
    placements: creatures[0] ? [{ row: 0, col: 0, creatureId: creatures[0].id }] : [],
  });
  // 5단계: 오디오 세션도 사용자 데이터라 삭제권 대상 — 실제 파일까지 남겨서 파기 검증한다.
  const audioBytes = await makeRealAudio({ seconds: 4, format: "wav" });
  await app.audioUpload.upload({
    userId: ctx.userId,
    clientRecordingId: randomUUID(),
    audioBytes,
    clientDurationMs: 4000,
    recordedAt: new Date().toISOString(),
  });
}

/** 그 계정의 데이터가 모든 저장소에 몇 건씩 있는지. */
async function footprint(app: App, userId: AuthContext["userId"]) {
  return {
    user: await app.repos.users.get(userId),
    observations: (await app.repos.observations.listByUser(userId)).length,
    collection: (await app.repos.collection.listByUser(userId)).length,
    questProgress: (await app.repos.quests.listProgressByUser(userId)).length,
    badges: (await app.repos.badges.listByUser(userId)).length,
    creatures: (await app.repos.creatures.listByUser(userId)).length,
    // 저장한 적 없는 사용자도 getLayout은 "가상 기본 정원"(항상 tiles가 채워짐, ports.ts
    // 계약 참고)을 돌려주므로 tiles 길이로는 "실제 저장했는지"를 못 가른다. placements는
    // 가상 기본값이 항상 빈 배열이라, 이걸로만 실제 저장 여부를 판별할 수 있다.
    gardenPlacements: (await app.repos.garden.getLayout(userId)).placements.length,
    audioSightings: (await app.repos.audioSightings.listByUser(userId)).length,
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

  // 사전 조건: 데이터가 실제로 쌓였는지(개체는 D단계: 종 첫 해금마다 자동 생성).
  const before = await footprint(app, ctx.userId);
  assert.ok(
    before.observations >= 2 && before.collection >= 2 && before.badges >= 1 &&
      before.creatures >= 2 && before.gardenPlacements >= 1 && before.audioSightings >= 1,
  );

  // 삭제 전에 오디오 파일이 실제로 디스크에 있는지 확인(파기 검증의 기준점).
  const [audioSightingBefore] = await app.repos.audioSightings.listByUser(ctx.userId);
  const audioStoragePath = audioSightingBefore!.storagePath!;
  assert.ok(await app.audioTempStore.read(audioStoragePath), "파기 전엔 오디오 파일이 있어야 함");

  const report = await app.dataRights.eraseUserData(ctx);

  const after = await footprint(app, ctx.userId);
  assert.equal(after.user, null, "프로필이 남으면 안 됨");
  assert.equal(after.observations, 0);
  assert.equal(after.collection, 0);
  assert.equal(after.questProgress, 0);
  assert.equal(after.badges, 0);
  assert.equal(after.creatures, 0);
  assert.equal(after.gardenPlacements, 0);
  assert.equal(after.audioSightings, 0);

  // 리포트가 실제 삭제 건수를 정확히 보고.
  assert.equal(report.deleted.observations, before.observations);
  assert.equal(report.deleted.badges, before.badges);
  assert.equal(report.deleted.creatures, before.creatures);
  assert.equal(report.deleted.gardenTiles, 1, "seedUserWithData가 심어둔 타일 1개");
  assert.equal(report.deleted.profile, true);
  assert.equal(report.deleted.audioSightings, before.audioSightings);
  // 미디어 blob 파기 대상이 수집됨.
  assert.equal(report.mediaRefsToPurge.length, before.observations);
  // 5단계: 오디오는 사진과 달리 TODO가 아니라 실제로 파일까지 지워졌어야 한다.
  assert.equal(await app.audioTempStore.read(audioStoragePath), null, "파기 후엔 오디오 파일도 없어야 함");
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
  assert.ok(b.creatures >= 2, "다른 계정 개체 유지");
  assert.ok(b.gardenPlacements >= 1, "다른 계정 정원 배치 유지");
  assert.ok(b.audioSightings >= 1, "다른 계정 오디오 세션 유지");

  // 다른 계정의 오디오 파일도 실제로 그대로 있어야 한다.
  const [audioSightingB] = await app.repos.audioSightings.listByUser(ctxB.userId);
  assert.ok(await app.audioTempStore.read(audioSightingB!.storagePath!), "다른 계정 오디오 파일 유지");
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

test("이동권: 내보내기는 내 데이터 사본(개체 포함)을 반환한다", async () => {
  const { app, ctx } = await oneUser("첫째");
  await seedUserWithData(app, ctx);

  const dump = await app.dataRights.exportUserData(ctx);
  assert.equal(dump.profile.nickname, "첫째");
  assert.ok(dump.observations.length >= 2);
  assert.ok(dump.collection.length >= 2);
  assert.ok(dump.creatures.length >= 2, "종 첫 해금마다 자동 생성된 개체도 포함돼야 함");
  // 이 시나리오는 좌표를 안 줬으므로 preciseCoord는 null(있는 것만 내보냄, 지어내지 않음).
  assert.ok(dump.observations.every((o) => o.preciseCoord === null));
});

test("이동권: 좌표를 준 관찰은 내보내기에 본인의 정밀 좌표가 그대로 포함된다(D단계)", async () => {
  const { app, ctx } = await oneUser("첫째");
  app.mock.enqueue([
    { scientificName: "Taraxacum officinale", vernacularName: "민들레", rank: "species", confidence: 0.92 },
  ]);
  await app.flow.observe(ctx, {
    images: [makeCleanJpeg()],
    media: [],
    groupHint: "plant",
    rawCoord: { lat: 37.1, lng: 127.2 },
  });

  const dump = await app.dataRights.exportUserData(ctx);
  assert.deepEqual(dump.observations[0]!.preciseCoord, { lat: 37.1, lng: 127.2 });
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
