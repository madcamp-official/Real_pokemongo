/**
 * 골든 테스트: 8단계 유사도 게이트웨이. 실제 GPU/CAMP-3 없이 가짜 AudioEmbeddingProvider +
 * InMemorySpeciesSoundReferenceRepo로 검증한다. ReferenceEmbeddingStore는 진짜 클래스를
 * tmpdir 기반으로 그대로 쓴다(디스크 I/O 자체가 테스트 대상이 아니라 값을 담는 그릇일
 * 뿐이라, AudioTempStore.test.ts와 같은 원칙으로 진짜 구현을 재사용).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SimilarityGateway } from "./SimilarityGateway.js";
import { ReferenceEmbeddingStore } from "../reference/ReferenceEmbeddingStore.js";
import { InMemorySpeciesSoundReferenceRepo } from "../../repositories/memory/InMemoryRepositories.js";
import type { AudioEmbeddingProvider, AudioEmbeddingResult } from "./AudioEmbeddingProvider.js";
import type { SpeciesSoundReference } from "../reference/referenceTypes.js";
import type { TaxonId } from "../../domain/types.js";

const GOOD_QUALITY = { snrDb: 25, activeDurationMs: 4000, durationMs: 4000 };

function fakeProvider(result: AudioEmbeddingResult | (() => Promise<AudioEmbeddingResult>)): AudioEmbeddingProvider & { calls: number } {
  let calls = 0;
  return {
    name: "fake-embedding",
    isConfigured: () => true,
    calls: 0,
    async embed() {
      calls++;
      (this as any).calls = calls;
      return typeof result === "function" ? result() : result;
    },
  } as AudioEmbeddingProvider & { calls: number };
}

function refRow(overrides: Partial<SpeciesSoundReference> & { id: string; taxonId: TaxonId }): SpeciesSoundReference {
  return {
    callType: "call",
    durationMs: 5000,
    sourceUrl: "https://example.invalid",
    creator: "tester",
    license: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "tester via test",
    qualityStatus: "approved",
    referenceSetVersion: "kr-bird-reference@2026-07",
    mediaRef: "local://unused.wav",
    ...overrides,
  };
}

async function newEmbeddingStore(): Promise<ReferenceEmbeddingStore> {
  return new ReferenceEmbeddingStore(join(tmpdir(), `seed-service-ref-embed-test-${randomUUID()}`));
}

test("승인된 참조가 하나도 없으면 supported:false — 모델 호출 자체를 아낀다", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const store = await newEmbeddingStore();
  const provider = fakeProvider({ modelVersion: "v1", segments: [] });
  const gateway = new SimilarityGateway(provider, refs, store);

  const outcome = await gateway.score({
    wavBytes: Buffer.from("x"),
    taxonId: "taxon-hypsipetes-amaurotis" as TaxonId,
    quality: GOOD_QUALITY,
  });

  assert.deepEqual(outcome, { supported: false });
  assert.equal(provider.calls, 0, "참조가 없으면 embed()를 호출하면 안 됨");
});

test("정상 채점: 가장 비슷한 세그먼트의 구간이 matched_segment로 나온다", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const store = await newEmbeddingStore();
  const embeddingRef = await store.save([1, 0]);
  await refs.upsertMany([
    refRow({ id: "ref-1", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef }),
  ]);

  const provider = fakeProvider({
    modelVersion: "birdnet-acoustic-2.4-pb",
    segments: [
      { startMs: 0, endMs: 3000, embedding: [0, 1] }, // 전혀 안 비슷함
      { startMs: 3000, endMs: 6000, embedding: [1, 0] }, // 완전히 같은 방향
    ],
  });
  const gateway = new SimilarityGateway(provider, refs, store);

  const outcome = await gateway.score({
    wavBytes: Buffer.from("x"),
    taxonId: "taxon-hypsipetes-amaurotis" as TaxonId,
    quality: GOOD_QUALITY,
  });

  assert.equal(outcome.supported, true);
  if (!outcome.supported) return;
  assert.equal(outcome.score, 100);
  assert.equal(outcome.grade, "strong_match");
  assert.deepEqual(outcome.matchedSegment, { startMs: 3000, endMs: 6000 });
  assert.equal(outcome.modelVersion, "birdnet-acoustic-2.4-pb");
  assert.equal(outcome.referenceSetVersion, "kr-bird-reference@2026-07");
  assert.deepEqual(outcome.feedbackCodes, []);
});

test("참조 클립이 여러 개면 top-3만 평균 낸다(4번째 이하는 무시)", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const store = await newEmbeddingStore();
  // 유사도가 1, 1, 1, 0(직교)이 되도록 구성 — top-3 평균은 1이어야 한다(4번째 0을 포함하면
  // 0.75가 돼야 하므로, 100점이 나오는지로 top-K가 실제로 적용됐는지 확인할 수 있다).
  const e1 = await store.save([1, 0]);
  const e2 = await store.save([1, 0]);
  const e3 = await store.save([1, 0]);
  const e4 = await store.save([0, 1]);
  await refs.upsertMany([
    refRow({ id: "ref-1", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef: e1 }),
    refRow({ id: "ref-2", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef: e2 }),
    refRow({ id: "ref-3", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef: e3 }),
    refRow({ id: "ref-4", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef: e4 }),
  ]);
  const provider = fakeProvider({
    modelVersion: "v1",
    segments: [{ startMs: 0, endMs: 3000, embedding: [1, 0] }],
  });
  const gateway = new SimilarityGateway(provider, refs, store);

  const outcome = await gateway.score({
    wavBytes: Buffer.from("x"),
    taxonId: "taxon-hypsipetes-amaurotis" as TaxonId,
    quality: GOOD_QUALITY,
  });

  assert.equal(outcome.supported, true);
  if (!outcome.supported) return;
  assert.equal(outcome.score, 100, "4번째(직교) 참조가 평균에 안 섞여야 100점 그대로");
});

test("혼동종 그룹(청둥오리/흰뺨검둥오리)의 참조가 유저 오디오와 더 비슷하면 점수가 깎인다", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const store = await newEmbeddingStore();
  const targetEmbeddingRef = await store.save([1, 0]);
  const confuserEmbeddingRef = await store.save([0.99, 0.14]); // target보다 유저 소리에 더 가까움
  await refs.upsertMany([
    refRow({ id: "ref-target", taxonId: "taxon-anas-platyrhynchos" as TaxonId, embeddingRef: targetEmbeddingRef }),
    refRow({ id: "ref-confuser", taxonId: "taxon-anas-zonorhyncha" as TaxonId, embeddingRef: confuserEmbeddingRef }),
  ]);
  const provider = fakeProvider({
    modelVersion: "v1",
    segments: [{ startMs: 0, endMs: 3000, embedding: [0.99, 0.15] }], // confuser 임베딩과 거의 동일
  });
  const gateway = new SimilarityGateway(provider, refs, store);

  const outcome = await gateway.score({
    wavBytes: Buffer.from("x"),
    taxonId: "taxon-anas-platyrhynchos" as TaxonId,
    quality: GOOD_QUALITY,
  });

  assert.equal(outcome.supported, true);
  if (!outcome.supported) return;
  assert.ok(outcome.score < 100, "혼동종이 더 비슷하면 만점이 나오면 안 됨");
});

test("모델 프로바이더가 실패하면 삼키지 않고 그대로 throw한다(doc03 '모델 오류는 5xx')", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const store = await newEmbeddingStore();
  const embeddingRef = await store.save([1, 0]);
  await refs.upsertMany([
    refRow({ id: "ref-1", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef }),
  ]);
  const provider: AudioEmbeddingProvider = {
    name: "failing",
    isConfigured: () => true,
    embed: async () => {
      throw new Error("모델 서비스 다운");
    },
  };
  const gateway = new SimilarityGateway(provider, refs, store);

  await assert.rejects(
    () =>
      gateway.score({
        wavBytes: Buffer.from("x"),
        taxonId: "taxon-hypsipetes-amaurotis" as TaxonId,
        quality: GOOD_QUALITY,
      }),
    /모델 서비스 다운/,
  );
});

test("승인된 참조는 있지만 전부 embeddingRef를 읽을 수 없으면 데이터 불일치로 throw한다", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const store = await newEmbeddingStore();
  await refs.upsertMany([
    refRow({ id: "ref-1", taxonId: "taxon-hypsipetes-amaurotis" as TaxonId, embeddingRef: undefined }),
  ]);
  const provider = fakeProvider({
    modelVersion: "v1",
    segments: [{ startMs: 0, endMs: 3000, embedding: [1, 0] }],
  });
  const gateway = new SimilarityGateway(provider, refs, store);

  await assert.rejects(() =>
    gateway.score({
      wavBytes: Buffer.from("x"),
      taxonId: "taxon-hypsipetes-amaurotis" as TaxonId,
      quality: GOOD_QUALITY,
    }),
  );
});
