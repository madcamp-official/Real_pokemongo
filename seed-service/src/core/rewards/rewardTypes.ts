/**
 * 보상 도메인 타입 (명세서 F8: 배지·레벨·보상).
 *
 * 게이미피케이션 원칙(§5): "모든 보상은 실제 관찰 활동에서 파생". 확률형(가챠) 없음.
 * 배지 조건은 결정론적 규칙(rule)으로만 정의한다.
 */
import type { UserId, TaxonGroup, Season } from "../domain/types.js";

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

/**
 * 프론트(F8) Badge.theme과 1:1. 우리 도메인엔 원래 없던 "표시용" 분류라, 지어내는 대신
 * seedData.ts에서 각 배지를 정의할 때 저작 콘텐츠로 함께 채운다(Taxon.habitatTags 등과
 * 같은 성격 — 계산값이 아니라 authored data).
 */
export type BadgeTheme = "수집" | "탐험" | "우정" | "연속출석";

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  rule: BadgeRule;
  xp: number; // 획득 시 부여 경험치
  theme: BadgeTheme;
  icon: string; // 이모지 등 표시용 아이콘
}

export interface EarnedBadge {
  userId: UserId;
  badgeId: string;
  earnedAt: string; // "해금"된 시각(규칙 충족 판정 시점)
  /**
   * D단계: 명시적 "받기"(claim) 시각. 배지가 해금(행 존재)돼도 이 값이 없으면 아직
   * XP를 받지 않은 상태다 — 프론트의 unlocked(=행 존재)/claimed(=이 값 존재) 2단계와 대응.
   */
  claimedAt?: string;
}

/** 레벨 곡선: 누적 XP → 레벨. 완만하게(과한 경쟁 지양). */
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

/**
 * 다음 레벨까지 남은 XP(프론트 XPProfile.xp_to_next). thresholds[level-1]이 현재 레벨
 * 문턱값, thresholds[level]이 다음 레벨 문턱값이라(0-index 보정), 그 차이가 "필요한 만큼"이다.
 * 곡선의 마지막 레벨(더 이상 다음 문턱값이 없음)이면 0 — 이미 최고 레벨이라는 뜻.
 */
export function xpToNextLevel(xp: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  const level = levelForXp(xp, curve);
  const nextThreshold = curve.thresholds[level]; // level은 1-index라 그대로가 다음 문턱값 인덱스
  if (nextThreshold === undefined) return 0; // 최고 레벨
  return Math.max(0, nextThreshold - xp);
}
