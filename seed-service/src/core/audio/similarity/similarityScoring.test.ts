/**
 * 골든 테스트: 8단계 점수 교정기. 실 오디오/DB 없이 순수 함수만 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { calibrateSimilarity } from "./similarityScoring.js";

const GOOD_QUALITY = { snrDb: 25, activeDurationMs: 4000, durationMs: 4000 };
const POOR_QUALITY = { snrDb: 5, activeDurationMs: 500, durationMs: 4000 };

test("완전히 같은 소리(positiveSimilarity=1, 혼동종 없음)는 100점·strong_match·high 신뢰도", () => {
  const r = calibrateSimilarity({ positiveSimilarity: 1, confuserSimilarity: null, quality: GOOD_QUALITY });
  assert.equal(r.score, 100);
  assert.equal(r.grade, "strong_match");
  assert.equal(r.scoreReliability, "high");
});

test("전혀 안 비슷함(positiveSimilarity=0)은 0점·low_similarity", () => {
  const r = calibrateSimilarity({ positiveSimilarity: 0, confuserSimilarity: null, quality: GOOD_QUALITY });
  assert.equal(r.score, 0);
  assert.equal(r.grade, "low_similarity");
});

test("등급 경계: 65/40/85 근처에서 올바른 등급으로 갈린다", () => {
  assert.equal(calibrateSimilarity({ positiveSimilarity: 0.85, confuserSimilarity: null, quality: GOOD_QUALITY }).grade, "strong_match");
  assert.equal(calibrateSimilarity({ positiveSimilarity: 0.84, confuserSimilarity: null, quality: GOOD_QUALITY }).grade, "very_similar");
  assert.equal(calibrateSimilarity({ positiveSimilarity: 0.65, confuserSimilarity: null, quality: GOOD_QUALITY }).grade, "very_similar");
  assert.equal(calibrateSimilarity({ positiveSimilarity: 0.64, confuserSimilarity: null, quality: GOOD_QUALITY }).grade, "somewhat_similar");
  assert.equal(calibrateSimilarity({ positiveSimilarity: 0.40, confuserSimilarity: null, quality: GOOD_QUALITY }).grade, "somewhat_similar");
  assert.equal(calibrateSimilarity({ positiveSimilarity: 0.39, confuserSimilarity: null, quality: GOOD_QUALITY }).grade, "low_similarity");
});

test("혼동종이 target보다 더 비슷하면(음수 margin) 점수가 깎인다", () => {
  const withoutConfuser = calibrateSimilarity({
    positiveSimilarity: 0.8,
    confuserSimilarity: null,
    quality: GOOD_QUALITY,
  });
  const withWorseConfuser = calibrateSimilarity({
    positiveSimilarity: 0.8,
    confuserSimilarity: 0.95, // 혼동종이 더 비슷하게 들림
    quality: GOOD_QUALITY,
  });
  assert.ok(withWorseConfuser.score < withoutConfuser.score, "혼동종이 더 비슷하면 감점돼야 함");
});

test("target이 혼동종보다 더 비슷하면(양수 margin) 보너스를 주지 않는다(감점만 하는 설계)", () => {
  const noConfuser = calibrateSimilarity({ positiveSimilarity: 0.8, confuserSimilarity: null, quality: GOOD_QUALITY });
  const betterThanConfuser = calibrateSimilarity({
    positiveSimilarity: 0.8,
    confuserSimilarity: 0.3, // target이 훨씬 더 비슷함
    quality: GOOD_QUALITY,
  });
  assert.equal(betterThanConfuser.score, noConfuser.score);
});

test("녹음 품질이 낮아도(SNR 낮음, 활성구간 짧음) score 자체는 그대로 — score_reliability만 낮아진다", () => {
  const good = calibrateSimilarity({ positiveSimilarity: 0.8, confuserSimilarity: null, quality: GOOD_QUALITY });
  const poor = calibrateSimilarity({ positiveSimilarity: 0.8, confuserSimilarity: null, quality: POOR_QUALITY });
  assert.equal(good.score, poor.score, "품질이 score를 깎으면 안 됨(의도적 분리 설계)");
  assert.equal(good.scoreReliability, "high");
  assert.equal(poor.scoreReliability, "low");
});

test("공유 계약 fixture 예시(score=78)와 같은 범위의 입력은 very_similar로 분류된다", () => {
  // fixtures/similarity-success.json: score=78, grade=very_similar. 정확한 원본 입력값은
  // 알 수 없으므로(계약이 최종 score만 예시로 줌), 78점에 해당하는 입력을 넣었을 때
  // 등급 경계가 fixture와 어긋나지 않는지만 확인한다.
  const r = calibrateSimilarity({ positiveSimilarity: 0.78, confuserSimilarity: null, quality: GOOD_QUALITY });
  assert.equal(r.score, 78);
  assert.equal(r.grade, "very_similar");
});
