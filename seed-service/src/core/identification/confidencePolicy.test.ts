/**
 * 골든 테스트: 확신도 분류 (체크리스트 §4.4 단위 — 임계값 경계).
 *
 * 임계값이 바뀌면 이 테스트가 깨져 "무엇이 바뀌었는지"를 드러낸다.
 * 불변식: high ≥ 0.85, medium ≥ 0.6, low ≥ 0.35, 그 미만은 unknown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyConfidence,
  rankSpecificity,
  DEFAULT_THRESHOLDS,
} from "./confidencePolicy.js";

test("확신도 구간 경계값이 정확히 분류된다", () => {
  const T = DEFAULT_THRESHOLDS;
  assert.equal(classifyConfidence(1.0), "high");
  assert.equal(classifyConfidence(T.high), "high"); // 0.85 포함
  assert.equal(classifyConfidence(T.high - 0.001), "medium");
  assert.equal(classifyConfidence(T.medium), "medium"); // 0.6 포함
  assert.equal(classifyConfidence(T.medium - 0.001), "low");
  assert.equal(classifyConfidence(T.low), "low"); // 0.35 포함
  assert.equal(classifyConfidence(T.low - 0.001), "unknown");
  assert.equal(classifyConfidence(0), "unknown");
});

test("rankSpecificity: 종이 가장 구체적, 상위로 갈수록 값이 커진다", () => {
  assert.ok(rankSpecificity("species") < rankSpecificity("genus"));
  assert.ok(rankSpecificity("genus") < rankSpecificity("family"));
  assert.ok(rankSpecificity("family") < rankSpecificity("order"));
});
