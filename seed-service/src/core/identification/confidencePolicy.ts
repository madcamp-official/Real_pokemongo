/**
 * 확신도 정책 (명세서 §7 "동정 신뢰도 & 폴백 정책").
 *
 * 핵심 규칙: "불확실할 때 단정하지 않는다. 틀릴 바엔 상위 분류로 물러선다."
 * 이 파일은 순수 함수만 담는다(부수효과 없음) — 규칙을 테스트·조정하기 쉽게.
 *
 * 임계값(threshold)은 여기 한 곳에서만 정의한다. 실측 후 튜닝 대상(명세서 §15).
 */

export type ConfidenceTier = "high" | "medium" | "low" | "unknown";

export interface ConfidenceThresholds {
  /** 이 값 이상이면 고확신 → 즉시 카드 해금. */
  high: number;
  /** 이 값 이상이면 중확신 → 후보 몇 개 중 아이가 고르기. */
  medium: number;
  /** 이 값 미만이면 사실상 실패(unknown)로 취급. */
  low: number;
}

/** 실측 전 잠정값. TODO(튜닝): 벤더별 신뢰도 분포 실측 후 조정(명세서 §15). */
export const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  high: 0.85,
  medium: 0.6,
  low: 0.35,
};

/** 중확신일 때 아이에게 보여줄 후보 최대 개수 (선택지 과다 방지). */
export const MAX_CANDIDATES_TO_SHOW = 3;

export function classifyConfidence(
  topConfidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
): ConfidenceTier {
  if (topConfidence >= thresholds.high) return "high";
  if (topConfidence >= thresholds.medium) return "medium";
  if (topConfidence >= thresholds.low) return "low";
  return "unknown";
}

/**
 * 계급 순위(종=가장 구체적). 상위분류 폴백에서 "얼마나 물러났는지" 판단에 사용.
 */
const RANK_ORDER = [
  "species",
  "genus",
  "family",
  "order",
  "class",
  "phylum",
  "kingdom",
] as const;

export function rankSpecificity(rank: string): number {
  const idx = RANK_ORDER.indexOf(rank as (typeof RANK_ORDER)[number]);
  return idx === -1 ? RANK_ORDER.length : idx; // 작을수록 구체적(species=0)
}

// 상위 분류 폴백(§7)은 게이트웨이가 Taxon.parentId 계통 트리를 이용해 수행한다.
// (종 확신도가 'low' 구간일 때, 그 종의 상위 분류군으로 물러나 "○○ 종류예요"로 안내)
