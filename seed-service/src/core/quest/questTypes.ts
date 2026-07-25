/**
 * 퀘스트 도메인 타입 (명세서 F7).
 *
 * 게이미피케이션 원칙(§5): 퀘스트는 "실제 야외 관찰"을 요구해야 하며 화면 내 태스크로
 * 완결되어선 안 된다. 그래서 완료 조건(criteria)은 전부 "관찰(Observation)"에 대한
 * 술어(predicate)로 정의된다.
 */
import type {
  UserId,
  Season,
  Habitat,
  TaxonGroup,
  Rarity,
} from "../domain/types.js";

export type QuestType =
  | "seasonal" // 계절 퀘스트 (교과 통합 '봄/여름/가을/겨울')
  | "theme" // 테마 (날개 달린 친구 5종 등)
  | "habitat" // 서식지 (우리 동네 공원 탐험)
  | "daily" // 데일리 (1일 1~2개 상한)
  | "family" // 가족 협동
  | "story"; // 스토리 챕터 (P1)

/**
 * 완료 조건. 여러 clause 를 모두 만족해야 하는 "관찰 N건" 형태.
 * 예: "봄에 피는 노란 꽃 3종" =>
 *   { season:'spring', group:'plant', distinctTaxa: 3, tagAny:['yellow'] }
 */
export interface QuestCriteria {
  /** 서로 다른 종을 몇 종 관찰해야 하는지(중복 관찰은 1로 카운트). */
  distinctTaxa: number;
  season?: Season;
  habitat?: Habitat;
  group?: TaxonGroup;
  rarity?: Rarity;
  /**
   * Taxon 에 부여된 자유 태그 중 하나라도 일치해야 함(예: 색/특징 태그).
   * 콘텐츠 태깅으로 확장. MVP에선 선택.
   */
  tagAny?: string[];
}

export interface QuestReward {
  xp: number;
  badgeId?: string;
  /** 꾸미기 보상 등(비사행성). */
  cosmetic?: string;
}

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  description: string;
  criteria: QuestCriteria;
  reward: QuestReward;
  /** 로테이션/유효기간. 계절 전환 시 자동 갱신(명세서 F7). */
  activeFrom: string;
  activeTo?: string;
  /** 스토리 모드용 챕터 순서(P1). */
  chapter?: number;
  curriculumTags?: string[]; // 교육과정 연계(§6)
}

export interface QuestProgress {
  userId: UserId;
  questId: string;
  /** 지금까지 이 퀘스트 조건을 만족시킨 서로 다른 taxonId 집합. */
  matchedTaxonIds: string[];
  completed: boolean;
  completedAt?: string;
  /**
   * D단계: 명시적 "받기"(claim) 시각. `completed=true`가 되는 시점(QuestEngine)과
   * 보상이 실제 지급되는 시점(RewardEngine.claimQuest)이 분리돼 있다 — 완료됐다고
   * 자동으로 XP가 들어오지 않는다. undefined면 아직 안 받은 것.
   */
  claimedAt?: string;
}
