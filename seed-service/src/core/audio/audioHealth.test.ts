/**
 * 골든 테스트: 9단계 readiness 체크. 실 네트워크 없이 fetchImpl 주입으로 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAudioHealth } from "./audioHealth.js";
import { InMemorySpeciesSoundReferenceRepo } from "../repositories/memory/InMemoryRepositories.js";
import type { TaxonId } from "../domain/types.js";

function refRow(id: string) {
  return {
    id,
    taxonId: "taxon-hypsipetes-amaurotis" as TaxonId,
    mediaRef: "local://x.wav",
    callType: "call",
    durationMs: 5000,
    sourceUrl: "https://example.invalid",
    creator: "tester",
    license: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "tester",
    qualityStatus: "approved" as const,
    referenceSetVersion: "kr-bird-reference@2026-07",
    embeddingRef: "embedding.json",
    embeddingModelVersion: "birdnet-acoustic-2.4-pb",
  };
}

test("모델 endpoint가 비어있으면 configured=false, reachable=false, ready=false(fetch도 안 함)", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  let fetchCalled = false;
  const report = await checkAudioHealth({
    modelEndpoint: "",
    modelTimeoutMs: 1000,
    references: refs,
    fetchImpl: (async () => {
      fetchCalled = true;
      return new Response("", { status: 200 });
    }) as typeof fetch,
  });
  assert.equal(report.model.configured, false);
  assert.equal(report.model.reachable, false);
  assert.equal(report.ready, false);
  assert.equal(fetchCalled, false, "endpoint 미설정이면 굳이 fetch하지 않아야 함");
});

test("모델은 도달 가능하지만 승인+임베딩완료 참조가 없으면 ready=false", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const report = await checkAudioHealth({
    modelEndpoint: "http://127.0.0.1:8932",
    modelTimeoutMs: 1000,
    references: refs,
    fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
  });
  assert.equal(report.model.configured, true);
  assert.equal(report.model.reachable, true);
  assert.equal(report.referenceEmbeddings.ready, false);
  assert.equal(report.referenceEmbeddings.approvedClipCount, 0);
  assert.equal(report.ready, false);
});

test("모델 /ready가 실패 응답이면 reachable=false", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const report = await checkAudioHealth({
    modelEndpoint: "http://127.0.0.1:8932",
    modelTimeoutMs: 1000,
    references: refs,
    fetchImpl: (async () => new Response("", { status: 503 })) as typeof fetch,
  });
  assert.equal(report.model.reachable, false);
  assert.equal(report.ready, false);
});

test("fetch가 예외를 던지면(타임아웃/연결거부) reachable=false로 안전하게 처리한다", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  const report = await checkAudioHealth({
    modelEndpoint: "http://127.0.0.1:8932",
    modelTimeoutMs: 1000,
    references: refs,
    fetchImpl: (async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch,
  });
  assert.equal(report.model.reachable, false);
  assert.equal(report.ready, false);
});

test("모델 도달 가능 + 승인된 임베딩 참조 있음 → ready=true", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  await refs.upsertMany([refRow("ref-hypsipetes-001")]);
  const report = await checkAudioHealth({
    modelEndpoint: "http://127.0.0.1:8932",
    modelTimeoutMs: 1000,
    expectedModelVersion: "birdnet-acoustic-2.4-pb",
    references: refs,
    fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
  });
  assert.equal(report.ready, true);
  assert.equal(report.referenceEmbeddings.approvedClipCount, 1);
  assert.equal(report.model.expectedVersion, "birdnet-acoustic-2.4-pb");
});

test("pending/rejected 상태거나 embeddingRef가 없는 행은 카운트에서 빠진다", async () => {
  const refs = new InMemorySpeciesSoundReferenceRepo();
  await refs.upsertMany([
    { ...refRow("ref-pending"), qualityStatus: "pending" },
    { ...refRow("ref-no-embedding"), embeddingRef: undefined },
  ]);
  const report = await checkAudioHealth({
    modelEndpoint: "http://127.0.0.1:8932",
    modelTimeoutMs: 1000,
    references: refs,
    fetchImpl: (async () => new Response("", { status: 200 })) as typeof fetch,
  });
  assert.equal(report.referenceEmbeddings.approvedClipCount, 0);
  assert.equal(report.ready, false);
});
