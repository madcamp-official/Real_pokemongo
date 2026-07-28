/**
 * 골든 테스트: 오디오 동정 게이트웨이.
 * 핵심 불변식(doc03 9장 + docs/audio/API_CONTRACT.md §2):
 *  - taxon으로 안 풀리는 종(미지원 모델 종)은 후보에서 제외된다.
 *  - low 임계값(0.35) 미만은 후보로도 안 보여준다.
 *  - 최대 3개까지만 보여준다.
 *  - 위험 태그가 있는 taxon이면 그 후보만 is_dangerous=true.
 *  - 후보가 하나도 안 남으면 unknown=true, needs_user_confirmation=false.
 *  - 프로바이더가 실패하면 삼키지 않고 그대로 throw한다(사진 게이트웨이와 다른 점).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioIdentificationGateway } from "./AudioIdentificationGateway.js";
import { InMemoryTaxonRepo } from "../../repositories/memory/InMemoryRepositories.js";
import type { AudioIdentificationProvider, AudioAnalysisResult, RawAudioCandidate } from "./AudioIdentificationProvider.js";
import type { Taxon, TaxonId } from "../../domain/types.js";

function taxon(overrides: {
  id: string;
  sciName: string;
  korName: string;
  riskTags?: Taxon["riskTags"];
}): Taxon {
  return {
    rank: "species",
    group: "bird",
    seasonTags: [],
    habitatTags: [],
    riskTags: overrides.riskTags ?? [],
    rarity: "common",
    id: overrides.id as TaxonId,
    sciName: overrides.sciName,
    korName: overrides.korName,
  };
}

function makeProvider(result: AudioAnalysisResult | (() => Promise<AudioAnalysisResult>)): AudioIdentificationProvider {
  return {
    name: "fake-birdnet",
    isConfigured: () => true,
    analyze: async () => (typeof result === "function" ? result() : result),
  };
}

function cand(sciName: string, score: number, startMs = 0, endMs = 3000): RawAudioCandidate {
  return { sciName, label: sciName, score, startMs, endMs };
}

async function seededTaxa(): Promise<InMemoryTaxonRepo> {
  const repo = new InMemoryTaxonRepo();
  await repo.upsertMany([
    taxon({ id: "taxon-hypsipetes-amaurotis", sciName: "Hypsipetes amaurotis", korName: "직박구리" }),
    taxon({ id: "taxon-passer-montanus", sciName: "Passer montanus", korName: "참새" }),
    taxon({ id: "taxon-pica-serica", sciName: "Pica serica", korName: "까치" }),
    taxon({
      id: "taxon-larus-crassirostris", sciName: "Larus crassirostris", korName: "괭이갈매기",
      riskTags: ["sting_or_bite"],
    }),
  ]);
  return repo;
}

test("고확신 단일 후보: candidates 1개, confidence_level=high, needs_user_confirmation=true", async () => {
  const taxa = await seededTaxa();
  const provider = makeProvider({
    candidates: [cand("Hypsipetes amaurotis", 0.87, 1100, 5300)],
    modelVersion: "birdnet@audio-mvp-1.0.0",
  });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));

  assert.equal(outcome.unknown, false);
  assert.equal(outcome.needsUserConfirmation, true);
  assert.equal(outcome.candidates.length, 1);
  const c = outcome.candidates[0]!;
  assert.equal(c.speciesId, "taxon-hypsipetes-amaurotis");
  assert.equal(c.commonNameKo, "직박구리");
  assert.equal(c.confidenceLevel, "high");
  assert.equal(c.startMs, 1100);
  assert.equal(c.endMs, 5300);
  assert.equal(c.isDangerous, false);
  assert.equal(outcome.modelVersion, "birdnet@audio-mvp-1.0.0");
});

test("여러 후보: medium/low가 함께 노출된다(사진과 달리 low도 안 숨김)", async () => {
  const taxa = await seededTaxa();
  const provider = makeProvider({
    candidates: [cand("Passer montanus", 0.62), cand("Pica serica", 0.41)],
    modelVersion: "birdnet@audio-mvp-1.0.0",
  });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));

  assert.equal(outcome.unknown, false);
  assert.equal(outcome.candidates.length, 2);
  assert.equal(outcome.candidates[0]!.confidenceLevel, "medium");
  assert.equal(outcome.candidates[1]!.confidenceLevel, "low");
});

test("미지원 모델 종(taxon으로 안 풀림)은 확정 후보에서 제외된다", async () => {
  const taxa = await seededTaxa();
  const provider = makeProvider({
    candidates: [cand("Sturnus vulgaris", 0.9), cand("Hypsipetes amaurotis", 0.5)],
    modelVersion: "v1",
  });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));

  assert.equal(outcome.candidates.length, 1, "지원 안 하는 Sturnus vulgaris는 빠져야 함");
  assert.equal(outcome.candidates[0]!.scientificName, "Hypsipetes amaurotis");
});

test("low 임계값(0.35) 미만은 후보에 안 들어간다", async () => {
  const taxa = await seededTaxa();
  const provider = makeProvider({
    candidates: [cand("Hypsipetes amaurotis", 0.34)],
    modelVersion: "v1",
  });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));
  assert.equal(outcome.candidates.length, 0);
  assert.equal(outcome.unknown, true);
});

test("후보가 4개 이상이어도 최대 3개까지만 보여준다", async () => {
  const taxa = await seededTaxa();
  await taxa.upsertMany([
    taxon({ id: "taxon-extra-1", sciName: "Extra one", korName: "여분1" }),
  ]);
  const provider = makeProvider({
    candidates: [
      cand("Hypsipetes amaurotis", 0.9),
      cand("Passer montanus", 0.8),
      cand("Pica serica", 0.7),
      cand("Larus crassirostris", 0.6),
    ],
    modelVersion: "v1",
  });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));
  assert.equal(outcome.candidates.length, 3);
  assert.equal(outcome.candidates[0]!.confidence, 0.9);
});

test("위험 태그가 있는 종만 is_dangerous=true", async () => {
  const taxa = await seededTaxa();
  const provider = makeProvider({
    candidates: [cand("Larus crassirostris", 0.9), cand("Hypsipetes amaurotis", 0.8)],
    modelVersion: "v1",
  });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));

  const gull = outcome.candidates.find((c) => c.scientificName === "Larus crassirostris");
  const bulbul = outcome.candidates.find((c) => c.scientificName === "Hypsipetes amaurotis");
  assert.equal(gull?.isDangerous, true);
  assert.equal(bulbul?.isDangerous, false);
});

test("후보가 하나도 안 남으면 unknown=true, unknown_reason=NO_SUPPORTED_BIRD_MATCH", async () => {
  const taxa = await seededTaxa();
  const provider = makeProvider({ candidates: [], modelVersion: "v1" });
  const gateway = new AudioIdentificationGateway(provider, taxa);
  const outcome = await gateway.identify(Buffer.from("x"));

  assert.equal(outcome.unknown, true);
  assert.equal(outcome.unknownReason, "NO_SUPPORTED_BIRD_MATCH");
  assert.equal(outcome.needsUserConfirmation, false);
  assert.deepEqual(outcome.candidates, []);
});

test("프로바이더가 실패하면 삼키지 않고 그대로 throw한다(사진 게이트웨이와 다름, doc03 '모델 오류는 5xx')", async () => {
  const taxa = await seededTaxa();
  const provider: AudioIdentificationProvider = {
    name: "failing",
    isConfigured: () => true,
    analyze: async () => {
      throw new Error("모델 서비스 다운");
    },
  };
  const gateway = new AudioIdentificationGateway(provider, taxa);
  await assert.rejects(() => gateway.identify(Buffer.from("x")), /모델 서비스 다운/);
});
