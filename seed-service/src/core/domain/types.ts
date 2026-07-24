/**
 * 도메인 타입 — 명세서 §8 "데이터 모델"의 코드 표현.
 *
 * 설계 원칙(명세서 §0):
 *  1) 프라이버시 우선 — Observation 에는 정밀 GPS 좌표를 담는 필드가 "존재하지 않는다".
 *     오직 행정구역 코드(regionCode)만 저장한다. 타입 수준에서 원칙을 강제한다.
 *  2) 안전 우선 — Taxon.riskTags 가 위험 생물 처리(F4)의 단일 진실 원천.
 *
 * 이 파일의 타입들은 대부분 "공유 코어"에 속한다(어린이/탐조/중장년 공용).
 * 어린이 버티컬 전용 개념(퀘스트 서사, 보호자 콘텐츠)은 child/ 하위에서 확장한다.
 */

// ---------------------------------------------------------------------------
// 식별자 (브랜디드 타입으로 서로 섞이지 않게)
// ---------------------------------------------------------------------------
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type TaxonId = Brand<string, "TaxonId">;
export type ObservationId = Brand<string, "ObservationId">;
export type QuestId = Brand<string, "QuestId">;
export type BadgeId = Brand<string, "BadgeId">;
export type MediaRef = Brand<string, "MediaRef">;

// ---------------------------------------------------------------------------
// 공통 열거형
// ---------------------------------------------------------------------------

/** 동정 대상 생물군. MVP는 식물·곤충 중심(명세서 §12: 새/양서류/음성동정 제외). */
export type TaxonGroup =
  | "plant"
  | "insect"
  | "fungus"
  | "bird" // 스키마상 존재하되 MVP 파이프라인에서는 라우팅 제외
  | "amphibian"
  | "reptile"
  | "mammal"
  | "other";

/** 분류 계급. 종 확정 실패 시 상위 계급으로 물러나는 폴백(명세서 §7)에 사용. */
export type TaxonRank =
  | "species"
  | "genus"
  | "family"
  | "order"
  | "class"
  | "phylum"
  | "kingdom";

/** 계절 축 — 도감/퀘스트/교육과정(통합교과 봄·여름·가을·겨울)과 정렬. */
export type Season = "spring" | "summer" | "autumn" | "winter";

/** 서식지 축 — 정밀 위치 없이 도감을 분류하고 퀘스트를 구성하는 근거. */
export type Habitat =
  | "neighborhood" // 우리 동네
  | "park" // 공원
  | "mountain" // 산
  | "waterside" // 물가
  | "garden" // 화단/정원
  | "field"; // 들판

/** 희귀도 등급(명세서 F5). 확률형 사행성과 무관한 "관찰 난이도" 표시일 뿐. */
export type Rarity = "common" | "uncommon" | "rare";

/**
 * 위험 태그(명세서 F4) — 안전 필터의 단일 진실 원천.
 * "식용 가부(edibility)"는 의도적으로 존재하지 않는다(독버섯 오판 리스크 회피).
 */
export type RiskTag =
  | "toxic_if_eaten" // 섭취 시 독성
  | "sting_or_bite" // 쏘임/물림 (벌, 뱀 등)
  | "contact_dermatitis" // 접촉성 피부염 (옻나무 등)
  | "allergen" // 알레르기 유발
  | "protected_species"; // 보호종 — 만지면 안 됨

// ---------------------------------------------------------------------------
// 종 마스터 DB (Taxon)
// ---------------------------------------------------------------------------
export interface Taxon {
  id: TaxonId;
  sciName: string; // 학명
  korName: string; // 국명 (국가생물종지식정보시스템 매핑 결과)
  aliases?: string[]; // 별명/속명 (아이용)
  rank: TaxonRank;
  parentId?: TaxonId; // 상위 분류군 — 폴백에 사용
  group: TaxonGroup;

  seasonTags: Season[];
  habitatTags: Habitat[];
  riskTags: RiskTag[]; // 비어 있으면 안전한 종
  rarity: Rarity;

  mediaRef?: MediaRef; // 대표 이미지 (도감 카드용)
}

// ---------------------------------------------------------------------------
// 관찰 레코드 (Observation) — 범용 코어 스키마
// ---------------------------------------------------------------------------

/**
 * 관찰 위치. **정밀 좌표(lat/lng) 필드가 없다.** 오직 행정구역 코드만.
 * 프라이버시 원칙을 스키마 수준에서 강제한다(명세서 §8, F12).
 */
export interface ObservedRegion {
  regionCode: string; // 시·군·구 수준 행정구역 코드 (예: "11680" 강남구)
  regionLabel?: string; // 표시용 (예: "서울 강남구")
}

export interface Observation {
  id: ObservationId;
  userId: UserId;
  taxonId: TaxonId | null; // 동정 실패/상위분류만 된 경우 null 가능
  taxonRank: TaxonRank | null; // 어느 계급까지 확정됐는지 (species가 아닐 수 있음)
  timestamp: string; // ISO8601

  region: ObservedRegion | null; // 위치 저장 OFF면 null

  media: MediaRef[];
  confidence: number; // 0..1
  source: string; // 어느 프로바이더/모델이 낸 결과인지 (로직 아님, 출처만)
  note?: string; // 아이의 한 줄 감상/이모지/음성메모 참조
}

// ---------------------------------------------------------------------------
// 도감 진행 (Collection)
// ---------------------------------------------------------------------------
export interface CollectionEntry {
  userId: UserId;
  taxonId: TaxonId;
  unlocked: boolean;
  firstObservedAt?: string; // 첫 발견 시각
  firstObservationId?: ObservationId;
  timesObserved: number;
}

// ---------------------------------------------------------------------------
// 계정 (단일 사용자 모델 — v1.2: 보호자·자녀 2단계 구조를 단일 계정으로 통합)
// ---------------------------------------------------------------------------

export type SubscriptionPlan = "free" | "family";

export interface User {
  id: UserId;
  // 인증 주체. 이메일/토큰 등은 인증 계층 소관이라 여기선 참조만.
  plan: SubscriptionPlan;
  locationStorageEnabled: boolean; // 기본 false (명세서 F12)
  nickname: string; // 실명 아님
  avatar: string;
  level: number;
  xp: number;
  createdAt: string;
}
