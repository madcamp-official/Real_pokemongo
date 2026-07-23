/**
 * 보상 도메인 타입 (명세서 F8: 배지·레벨·보상).
 *
 * 게이미피케이션 원칙(§5): "모든 보상은 실제 관찰 활동에서 파생". 확률형(가챠) 없음.
 * 배지 조건은 결정론적 규칙(rule)으로만 정의한다.
 */
import type { ChildId, TaxonGroup, Season } from "../domain/types.js";

/**
 * 배지 획득 규칙. 순수 카운트 기반(결정론적).
 * - firstObservation: 첫 발견
 * - totalObservations: 누적 관찰 N건
 * - distinctTaxaInGroup: 특정 군에서 서로 다른 N종 (곤충 10종 마스터 등)
 * - seasonComplete: 특정 계절 도감 100%
 * - questCount: 퀘스트 N개 완료
 */
export type BadgeRule =
  | { kind: "firstObservation" }
  | { kind: "totalObservations"; count: number }
  | { kind: "distinctTaxaInGroup"; group: TaxonGroup; count: number }
  | { kind: "seasonComplete"; season: Season }
  | { kind: "questCount"; count: number };

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  rule: BadgeRule;
  xp: number; // 획득 시 부여 경험치
}

export interface EarnedBadge {
  childId: ChildId;
  badgeId: string;
  earnedAt: string;
}

/** 레벨 곡선: 누적 XP → 레벨. 완만하게(아동 대상, 과한 경쟁 지양). */
export interface LevelCurve {
  /** level N 에 도달하기 위한 누적 XP 문턱값 배열(index=level-1). */
  thresholds: number[];
}

export const DEFAULT_LEVEL_CURVE: LevelCurve = {
  // 완만한 증가. TODO(튜닝): 실측 리텐션 보고 조정.
  thresholds: [0, 50, 120, 220, 360, 540, 760, 1020, 1320, 1660],
};

export function levelForXp(xp: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  let level = 1;
  for (let i = 0; i < curve.thresholds.length; i++) {
    if (xp >= curve.thresholds[i]!) level = i + 1;
    else break;
  }
  return level;
}
