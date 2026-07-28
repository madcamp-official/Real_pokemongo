/**
 * Postgres 어댑터 opt-in 통합 테스트. `npm test`(기본 실행)는 네트워크를 전혀 타지 않아야
 * 하므로, `DATABASE_URL`이 없으면 전부 스킵된다(BioClipProvider의 실서버 검증을 수동으로
 * 분리해둔 것과 동일한 관례).
 *
 * 수동 실행법:
 *   ssh -L 5433:127.0.0.1:5432 root@172.10.5.71   # 터널을 먼저 연다
 *   DATABASE_URL=postgres://seed_app:<비밀번호>@127.0.0.1:5433/seed_service npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  PgUserRepo,
  PgTaxonRepo,
  PgObservationRepo,
  PgCollectionRepo,
  PgQuestRepo,
  PgBadgeRepo,
  PgCreatureRepo,
  PgAudioSightingRepo,
  PgAudioIdentificationResultRepo,
} from "./PostgresRepositories.js";
import type { User, Taxon, Observation, CollectionEntry, Creature } from "../../domain/types.js";
import type { EarnedBadge } from "../../rewards/rewardTypes.js";
import type { AudioSighting } from "../../audio/audioTypes.js";
import type { AudioIdentificationResult } from "../../audio/identification/audioIdentificationTypes.js";

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : "DATABASE_URL 미설정 — SSH 터널을 연 뒤 수동 실행(파일 상단 주석 참고)";

const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : undefined;

// PgQuestRepo/PgBadgeRepo 테스트는 시드 데이터(taxon/quest/badge_definition)가 이미 DB에
// 있다고 가정한다(실제 서버가 buildApp()에서 매 부팅마다 하는 일과 동일). 어댑터만 단독으로
// 테스트하면 그 시딩이 안 돼 있으므로, 여기서 실제 부팅 경로를 한 번 그대로 태워 시딩한다.
if (DATABASE_URL) {
  const { buildApp } = await import("../../../composition.js");
  const { loadConfig } = await import("../../../config/index.js");
  const cfg = loadConfig();
  cfg.database.url = DATABASE_URL;
  const seeded = await buildApp(cfg);
  await seeded.dbPool?.end();
}

function newUserRow(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID() as User["id"],
    plan: "free",
    locationStorageEnabled: false,
    nickname: "통합테스트",
    avatar: "fox",
    level: 1,
    xp: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function withUser(fn: (userId: User["id"]) => Promise<void>) {
  const users = new PgUserRepo(pool!);
  const u = newUserRow();
  await users.save(u);
  try {
    await fn(u.id);
  } finally {
    // app_user 삭제는 observation/collection_entry/creature/earned_badge/quest_progress를
    // 전부 ON DELETE CASCADE로 정리한다(db/schema.sql).
    await users.delete(u.id);
  }
}

test("PgUserRepo: save/get/delete 왕복", { skip }, async () => {
  const users = new PgUserRepo(pool!);
  const u = newUserRow({ nickname: "왕복테스트", xp: 42, level: 2 });
  await users.save(u);
  try {
    const fetched = await users.get(u.id);
    assert.equal(fetched?.nickname, "왕복테스트");
    assert.equal(fetched?.xp, 42);
    assert.equal(fetched?.level, 2);

    // save()는 update로도 동작해야 한다(RewardEngine이 xp 갱신 시 재호출).
    await users.save({ ...u, xp: 100 });
    const updated = await users.get(u.id);
    assert.equal(updated?.xp, 100);
  } finally {
    assert.equal(await users.delete(u.id), true);
  }
  assert.equal(await users.get(u.id), null);
});

test("PgTaxonRepo: upsertMany 후 계절/서식지/위험태그/별명이 정확히 왕복된다", { skip }, async () => {
  const taxa = new PgTaxonRepo(pool!);
  const id = `taxon-it-${randomUUID()}` as Taxon["id"];
  const t: Taxon = {
    id,
    sciName: `Integration testus ${id}`,
    korName: "통합테스트꽃",
    aliases: ["yellow", "노란꽃"],
    rank: "species",
    group: "plant",
    seasonTags: ["spring", "summer"],
    habitatTags: ["park"],
    riskTags: ["allergen"],
    rarity: "common",
  };
  try {
    await taxa.upsertMany([t]);
    const fetched = await taxa.get(id);
    assert.ok(fetched);
    assert.deepEqual(fetched!.seasonTags.sort(), ["spring", "summer"]);
    assert.deepEqual(fetched!.habitatTags, ["park"]);
    assert.deepEqual(fetched!.riskTags, ["allergen"]);
    assert.deepEqual(fetched!.aliases?.sort(), ["yellow", "노란꽃"].sort());

    const bySci = await taxa.findBySciName(t.sciName.toUpperCase()); // 대소문자 무시
    assert.equal(bySci?.id, id);

    // 재업서트하면 태그가 교체(추가 아님)돼야 한다.
    await taxa.upsertMany([{ ...t, seasonTags: ["winter"] }]);
    const refetched = await taxa.get(id);
    assert.deepEqual(refetched!.seasonTags, ["winter"]);
  } finally {
    await pool!.query("DELETE FROM taxon WHERE id = $1", [id]);
  }
});

test("PgObservationRepo: preciseCoord/region이 분리 저장되고, media 순서가 보존된다", { skip }, async () => {
  await withUser(async (userId) => {
    const observations = new PgObservationRepo(pool!);
    const o: Observation = {
      id: randomUUID() as Observation["id"],
      userId,
      taxonId: null,
      taxonRank: null,
      timestamp: new Date().toISOString(),
      modality: "photo",
      region: null, // 동의 OFF
      preciseCoord: { lat: 37.5, lng: 127.0 }, // D단계: 동의 무관 저장
      media: ["local://a.bin", "local://b.bin"] as Observation["media"],
      confidence: 0.9,
      source: "test",
    };
    await observations.save(o);
    const fetched = await observations.get(o.id);
    assert.equal(fetched?.region, null);
    assert.deepEqual(fetched?.preciseCoord, { lat: 37.5, lng: 127.0 });
    assert.deepEqual(fetched?.media, ["local://a.bin", "local://b.bin"]);
    assert.equal(fetched?.modality, "photo"); // 5단계: modality 왕복 확인

    const list = await observations.listByUser(userId);
    assert.equal(list.length, 1);
  });
});

function newAudioSightingRow(userId: User["id"], overrides: Partial<AudioSighting> = {}): AudioSighting {
  const now = new Date();
  return {
    id: randomUUID() as AudioSighting["id"],
    userId,
    clientRecordingId: randomUUID(),
    status: "ready",
    mediaKind: "audio",
    mimeType: "audio/wav",
    durationMs: 4000,
    sha256: "a".repeat(64),
    storagePath: "local://audio-it-test.bin",
    quality: {
      usable: true,
      durationMs: 4000,
      activeDurationMs: 4000,
      snrDb: 20,
      clippingRatio: 0,
      silenceRatio: 0,
      speechRatio: 0,
      feedbackCodes: [],
      validSegments: [{ startMs: 0, endMs: 4000, qualityScore: 1 }],
    },
    recordedAt: now.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

test("PgAudioSightingRepo: recorded_at이 왕복되고, 5단계 TTL 스윕(findExpired/deleteById)이 동작한다", { skip }, async () => {
  await withUser(async (userId) => {
    const repo = new PgAudioSightingRepo(pool!);
    const recordedAt = new Date("2026-07-20T10:00:00.000Z").toISOString();
    const notExpired = newAudioSightingRow(userId, { recordedAt });
    const expired = newAudioSightingRow(userId, {
      recordedAt,
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // 1분 전 만료
    });
    await repo.create(notExpired);
    await repo.create(expired);

    const fetched = await repo.get(notExpired.id);
    assert.equal(fetched?.recordedAt, recordedAt); // recorded_at 왕복 확인(5단계 버그 수정)
    assert.equal(fetched?.confirmedObservationId, undefined); // 아직 미확정

    const foundExpired = await repo.findExpired(new Date(), 10);
    const foundIds = foundExpired.map((s) => s.id);
    assert.ok(foundIds.includes(expired.id), "만료된 세션이 findExpired에 나와야 함");
    assert.ok(!foundIds.includes(notExpired.id), "안 만료된 세션은 findExpired에 나오면 안 됨");

    await repo.deleteById(expired.id);
    assert.equal(await repo.get(expired.id), null);
    assert.ok(await repo.get(notExpired.id), "안 만료된 세션은 그대로 남아야 함");

    await repo.deleteByUser(userId); // 정리
  });
});

test("PgAudioIdentificationResultRepo: candidates_json이 왕복되고, 재동정은 upsert(덮어쓰기)로 동작한다", { skip }, async () => {
  await withUser(async (userId) => {
    const sightingRepo = new PgAudioSightingRepo(pool!);
    const resultRepo = new PgAudioIdentificationResultRepo(pool!);
    const sighting = newAudioSightingRow(userId);
    await sightingRepo.create(sighting);

    const first: AudioIdentificationResult = {
      audioSightingId: sighting.id,
      candidates: [
        {
          speciesId: "taxon-hypsipetes-amaurotis" as any,
          commonNameKo: "직박구리",
          scientificName: "Hypsipetes amaurotis",
          confidence: 0.87,
          confidenceLevel: "high",
          startMs: 1100,
          endMs: 5300,
          isDangerous: false,
        },
      ],
      unknown: false,
      modelProvider: "birdnet",
      modelVersion: "birdnet@audio-mvp-1.0.0",
      locationPriorUsed: false,
      createdAt: new Date("2026-07-28T10:00:00.000Z").toISOString(),
    };
    await resultRepo.upsert(first);

    const fetched = await resultRepo.get(sighting.id);
    assert.equal(fetched?.candidates.length, 1);
    assert.equal(fetched?.candidates[0]?.scientificName, "Hypsipetes amaurotis");
    assert.equal(fetched?.unknown, false);
    assert.equal(fetched?.modelVersion, "birdnet@audio-mvp-1.0.0");

    // 재동정: 같은 audio_sighting_id로 다시 upsert하면 이전 스냅샷이 아니라 새 값으로
    // 덮어써져야 한다(STATE_MACHINE.md "identified -> Identify again" = 이력이 아니라 최신값).
    const second: AudioIdentificationResult = {
      ...first,
      candidates: [],
      unknown: true,
      unknownReason: "NO_SUPPORTED_BIRD_MATCH",
    };
    await resultRepo.upsert(second);
    const refetched = await resultRepo.get(sighting.id);
    assert.equal(refetched?.unknown, true);
    assert.equal(refetched?.unknownReason, "NO_SUPPORTED_BIRD_MATCH");
    assert.deepEqual(refetched?.candidates, []);

    await sightingRepo.deleteByUser(userId); // audio_identification_result도 CASCADE로 함께 정리
  });
});

test("PgCollectionRepo + PgCreatureRepo: 종당 개체 1마리 UNIQUE 제약이 실제로 걸린다", { skip }, async () => {
  await withUser(async (userId) => {
    const taxa = new PgTaxonRepo(pool!);
    const collection = new PgCollectionRepo(pool!);
    const creatures = new PgCreatureRepo(pool!);
    const taxonId = `taxon-it-${randomUUID()}` as Taxon["id"];
    await taxa.upsertMany([
      {
        id: taxonId,
        sciName: `Uniqueness testus ${taxonId}`,
        korName: "유일성테스트",
        rank: "species",
        group: "plant",
        seasonTags: [],
        habitatTags: [],
        riskTags: [],
        rarity: "common",
      },
    ]);
    try {
      const entry: CollectionEntry = {
        userId,
        taxonId,
        unlocked: true,
        firstObservedAt: new Date().toISOString(),
        timesObserved: 1,
      };
      await collection.save(entry);
      assert.equal((await collection.get(userId, taxonId))?.unlocked, true);

      const c1: Creature = {
        id: randomUUID() as Creature["id"],
        userId,
        taxonId,
        bond: 1,
        createdAt: new Date().toISOString(),
      };
      await creatures.save(c1);
      assert.equal((await creatures.getByUserAndTaxon(userId, taxonId))?.id, c1.id);

      // 같은 (user, taxon)으로 두 번째 개체를 만들려 하면 UNIQUE 제약 위반으로 거부돼야 한다.
      const c2: Creature = { ...c1, id: randomUUID() as Creature["id"] };
      await assert.rejects(() => creatures.save(c2));
    } finally {
      // withUser()의 finally(사용자 삭제 CASCADE)보다 먼저 실행되므로, taxon을 참조하는
      // 사용자 데이터를 여기서 직접 먼저 지워야 taxon FK(ON DELETE RESTRICT)에 안 걸린다.
      await pool!.query("DELETE FROM creature WHERE taxon_id = $1", [taxonId]);
      await pool!.query("DELETE FROM collection_entry WHERE taxon_id = $1", [taxonId]);
      await pool!.query("DELETE FROM taxon WHERE id = $1", [taxonId]);
    }
  });
});

test("PgQuestRepo: 시드 퀘스트 조회 + saveProgress가 matchedTaxonIds/claimedAt까지 왕복한다", { skip }, async () => {
  await withUser(async (userId) => {
    const quests = new PgQuestRepo(pool!);
    const all = await quests.listActive();
    assert.ok(all.length > 0, "composition.ts 부팅 시 upsertMany(SEED_QUESTS)가 이미 실행돼 있어야 함");
    const questId = all[0]!.id;

    await quests.saveProgress({
      userId,
      questId,
      matchedTaxonIds: ["taxon-dandelion"],
      completed: true,
      completedAt: new Date().toISOString(),
    });
    let progress = await quests.getProgress(userId, questId);
    assert.deepEqual(progress?.matchedTaxonIds, ["taxon-dandelion"]);
    assert.equal(progress?.completed, true);
    assert.equal(progress?.claimedAt, undefined);

    await quests.saveProgress({ ...progress!, claimedAt: new Date().toISOString() });
    progress = await quests.getProgress(userId, questId);
    assert.ok(progress?.claimedAt, "claim 후에는 claimedAt이 채워져야 함");
  });
});

test("PgBadgeRepo: award는 멱등, markClaimed는 대상 없으면 false", { skip }, async () => {
  await withUser(async (userId) => {
    const badges = new PgBadgeRepo(pool!);
    const badgeId = "badge-first-find"; // composition.ts가 SEED_BADGES를 badge_definition에 미리 넣어둠
    const earned: EarnedBadge = { userId, badgeId, earnedAt: new Date().toISOString() };
    await badges.award(earned);
    await badges.award(earned); // 멱등 — 에러 없이 그대로
    assert.equal(await badges.has(userId, badgeId), true);
    assert.equal((await badges.get(userId, badgeId))?.claimedAt, undefined);

    assert.equal(await badges.markClaimed(userId, "badge-no-such", new Date().toISOString()), false);
    assert.equal(await badges.markClaimed(userId, badgeId, new Date().toISOString()), true);
    assert.ok((await badges.get(userId, badgeId))?.claimedAt);
  });
});
