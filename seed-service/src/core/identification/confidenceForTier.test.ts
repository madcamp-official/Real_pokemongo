/**
 * confidenceForTier: BioClipProvider가 계산한 tier가, 기존 classifyConfidence()로 재분류해도
 * 반드시 동일한 결과를 내는지 검증한다(B단계 핵심 설계 결정). 그리고 단조증가성(순서 보존)을
 * 직접 검증한다 — 이게 깨지면 candidates 정렬이 뒤바뀌는 실제 버그로 이어진다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { confidenceForTier } from "./confidenceForTier.js";
import { classifyConfidence, DEFAULT_THRESHOLDS } from "./confidencePolicy.js";

const T = DEFAULT_THRESHOLDS;
const TIERS = ["high", "medium", "low", "unknown"] as const;

test("classifyConfidence(confidenceForTier(raw, tier)) 는 항상 tier와 같다 (원래도 그 tier인 경우 + 강등되는 경우 모두)", () => {
  const rawSamples = [1.0, 0.95, 0.85, 0.7, 0.6, 0.5, 0.35, 0.2, 0.05, 0.0];
  for (const tier of TIERS) {
    for (const raw of rawSamples) {
      const encoded = confidenceForTier(raw, tier);
      assert.equal(
        classifyConfidence(encoded),
        tier,
        `raw=${raw}, tier=${tier} -> encoded=${encoded} 가 ${tier}로 재분류돼야 함`,
      );
    }
  }
});

test("high: 원래 낮은 raw여도 high 경계 이상으로 강제된다", () => {
  assert.equal(confidenceForTier(0.1, "high"), T.high);
  assert.equal(confidenceForTier(0.97, "high"), 0.97); // 이미 high면 원래 값(백분율 표시용) 보존
});

test("medium: 강등 케이스(raw가 원래 high대) -> high 경계 미만으로 클램프", () => {
  const encoded = confidenceForTier(0.97, "medium");
  assert.ok(encoded < T.high, "high 경계 미만이어야 함");
  assert.ok(encoded >= T.medium, "medium 경계 이상이어야 함");
  assert.equal(classifyConfidence(encoded), "medium");
});

test("low: 강등 케이스(raw가 원래 high대) -> medium 경계 미만으로 클램프", () => {
  const encoded = confidenceForTier(0.9, "low");
  assert.ok(encoded < T.medium);
  assert.ok(encoded >= T.low);
  assert.equal(classifyConfidence(encoded), "low");
});

test("unknown: raw가 아무리 높아도(DISAGREE_STRONG) low 경계 미만으로 강제된다", () => {
  const encoded = confidenceForTier(0.99, "unknown");
  assert.ok(encoded < T.low);
  assert.equal(classifyConfidence(encoded), "unknown");
});

test("단조증가(monotonic): 같은 tier 안에서는 raw 순서가 encoded 순서로 보존된다", () => {
  const raws = [0.0, 0.1, 0.34, 0.35, 0.5, 0.59, 0.6, 0.8, 0.84, 0.85, 0.9, 1.0];
  for (const tier of TIERS) {
    let prevRaw: number | null = null;
    let prevEncoded = -Infinity;
    for (const raw of raws) {
      const encoded = confidenceForTier(raw, tier);
      assert.ok(
        encoded >= prevEncoded,
        `tier=${tier}: raw ${prevRaw}->${raw} 인데 encoded ${prevEncoded}->${encoded} 로 역전됨`,
      );
      prevRaw = raw;
      prevEncoded = encoded;
    }
  }
});

test("경계값(정확히 threshold와 같은 raw)에서도 예외 없이 올바른 tier로 인코딩된다", () => {
  assert.equal(classifyConfidence(confidenceForTier(T.high, "high")), "high");
  assert.equal(classifyConfidence(confidenceForTier(T.medium, "medium")), "medium");
  assert.equal(classifyConfidence(confidenceForTier(T.low, "low")), "low");
  assert.equal(classifyConfidence(confidenceForTier(T.low, "unknown")), "unknown");
});
