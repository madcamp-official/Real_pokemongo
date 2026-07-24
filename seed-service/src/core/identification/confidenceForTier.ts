/**
 * B단계: BioClipProvider가 자체적으로 계산한 최종 tier(HybridClassifier.predict()의
 * final_tier)를, 기존 IdentificationGateway/confidencePolicy의 인터페이스를 전혀 바꾸지
 * 않고 그대로 반영하기 위한 순수 함수.
 *
 * IdentificationGateway.identify()는 프로바이더가 반환한 candidates[].confidence 숫자만
 * 보고 classifyConfidence()로 tier를 자체 재계산한다(프로바이더가 tier를 직접 지정할 방법이
 * 없음). 이 함수는 raw confidence를, "classifyConfidence()로 다시 분류해도 반드시 지정한
 * tier가 나오는" 값으로 클램프한다.
 *
 * 단조증가(monotonic) 함수이므로, 여러 후보에 동일한 tier로 일괄 적용해도 원래의 상대적
 * 순위(정렬 순서)가 절대 바뀌지 않는다 — top1에만 적용하면 다른 후보가 실수로 앞서는 회귀가
 * 생길 수 있어(게이트웨이가 매 요청마다 confidence 기준으로 재정렬함), 호출부는 반드시
 * candidates 배열 전체에 동일하게 적용해야 한다.
 */
import type { ConfidenceTier, ConfidenceThresholds } from "./confidencePolicy.js";
import { DEFAULT_THRESHOLDS } from "./confidencePolicy.js";

/** 부동소수점 경계값 자체가 다음 구간으로 새는 것을 막기 위한 여유값. */
const EPS = 1e-6;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

export function confidenceForTier(
  raw: number,
  tier: ConfidenceTier,
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): number {
  switch (tier) {
    case "high":
      return Math.max(raw, thresholds.high);
    case "medium":
      return clamp(raw, thresholds.medium, thresholds.high - EPS);
    case "low":
      return clamp(raw, thresholds.low, thresholds.medium - EPS);
    case "unknown":
      return Math.min(raw, thresholds.low - EPS);
  }
}
