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
/** C단계: 업로드~동정확정 사이 임시 상태를 가리키는 식별자(PendingSightingStore). */
export type SightingId = Brand<string, "SightingId">;
/** D단계: 개체(친구) 식별자(F9/F16). */
export type CreatureId = Brand<string, "CreatureId">;
/**
 * 소리 기능(오디오) 3단계: 업로드~변환 뒤 만들어지는 영속 세션의 식별자.
 * PendingSightingStore(SightingId, 인메모리)와 달리 DB에 24시간 TTL로 저장된다 —
 * `03_소리기능_서버_GPU_구현계획_팀원.md` 5단계가 요구하는 영속 요구사항 때문에 사진
 * 파이프라인과 의도적으로 다른 저장 성격을 갖는다(core/audio/audioTypes.ts 참고).
 */
export type AudioSightingId = Brand<string, "AudioSightingId">;

// ---------------------------------------------------------------------------
// 공통 열거형
// ---------------------------------------------------------------------------

/**
 * 동정 대상 생물군. 2026-07-27 species-pool 2단계 MVP(82종)부터 plant/insect/fungus/
 * bird/reptile을 실제로 다룬다(BioClipProvider.supports와 동기화 유지). amphibian/
 * mammal/other는 스키마상 존재하되 아직 종 데이터가 비어 있어 라우팅돼도 결과가 없다
 * (research/species-pool/step2-embedding-selection/README.md 참고).
 */
export type TaxonGroup =
  | "plant"
  | "insect"
  | "fungus"
  | "bird"
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

/** 활동 시간대(F6 종 카드). "밤"만 활동하는 종은 드물어 낮/둘다/밤 3구간이면 충분. */
export type ActiveTime = "day" | "both" | "night";

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

  // F6 종 카드 표시용. 없으면 API가 빈 문자열로 정직하게 남긴다(지어내지 않음).
  sizeDescription?: string; // 자유 텍스트 — 종마다 단위가 다름(곤충 mm, 나무 m 등)
  activeTime?: ActiveTime;
}

// ---------------------------------------------------------------------------
// 관찰 레코드 (Observation) — 범용 코어 스키마
// ---------------------------------------------------------------------------

/**
 * 관찰 위치(일반화). 오직 행정구역 코드만 — 정밀 좌표는 여기 없다.
 * 프라이버시 원칙을 스키마 수준에서 강제한다(명세서 §8, F12). 이 필드는 여전히
 * `locationStorageEnabled`(보호자 동의) 게이트를 그대로 따른다(D단계에서도 변경 없음).
 */
export interface ObservedRegion {
  regionCode: string; // 시·군·구 수준 행정구역 코드 (예: "11680" 강남구)
  regionLabel?: string; // 표시용 (예: "서울 강남구")
}

/**
 * 정밀 좌표(D단계, 제품 결정). **`ObservedRegion`과 별개 필드**다 — region은 여전히
 * 동의(locationStorageEnabled) 게이트를 따르지만, 이 필드는 사용자가 명시적으로
 * "정밀 위치를 동의 여부와 무관하게 항상 저장하기"로 결정한 대상이다(regionGeneralizer.ts의
 * resolveRegionForStorage와는 다른, 별도 경로로 채워짐 — ObservationFlow.recordIdentification
 * 참고). 나중에 이 결정을 되돌려 동의 게이트 안으로 옮기기 쉽도록 region과 분리해뒀다.
 */
export interface PreciseCoordinate {
  lat: number;
  lng: number;
}

/** 5단계(DB와 임시 세션) — docs/audio/DATA_CONTRACT.md "Existing observation extension".
 * 기존 관찰은 전부 "photo"로 해석된다(마이그레이션 DEFAULT가 보증, 0003_audio_stage5.sql). */
export type ObservationModality = "photo" | "audio";

export interface Observation {
  id: ObservationId;
  userId: UserId;
  taxonId: TaxonId | null; // 동정 실패/상위분류만 된 경우 null 가능
  taxonRank: TaxonRank | null; // 어느 계급까지 확정됐는지 (species가 아닐 수 있음)
  timestamp: string; // ISO8601
  modality: ObservationModality;

  region: ObservedRegion | null; // 위치 저장 OFF면 null(동의 게이트, 기존과 동일)
  preciseCoord: PreciseCoordinate | null; // 클라이언트가 좌표를 안 줬으면 null(D단계, 동의 무관)

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
// 개체 & 친밀도 (Creature, F9/F16 — D단계)
// ---------------------------------------------------------------------------

/**
 * 종 단위 해금(CollectionEntry) 위에 얹히는 "개체 단위 동반자". 종을 처음 해금할 때
 * 자동으로 1마리 생성되고(ObservationFlow.recordIdentification), 종당 최대 1마리로
 * 제한한다(제품 결정 — D단계). 홈가든(F16) 화면이 이 레코드를 배치·표시한다.
 */
export interface Creature {
  id: CreatureId;
  userId: UserId;
  taxonId: TaxonId;
  nickname?: string; // 아이가 나중에 붙일 수 있음(작명 API)
  originObservationId?: ObservationId; // 유래한 관찰(선택 — 관찰이 파기돼도 개체는 유지)
  bond: number; // 친밀도(F9). 기본 1.
  lastInteractionAt?: string; // 재회(reunion) 판정 기준
  createdAt: string; // "함께한 일수" 파생 기준
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

/**
 * 인증 자격증명(C단계) — 의도적으로 User 와 분리한다. User 는 RewardEngine 등 도메인
 * 로직 전반에서 계속 읽고 쓰는 객체라, 비밀번호 해시처럼 민감한 필드를 거기 얹으면
 * 도메인 코드가 자격증명을 실수로 건드릴 표면이 넓어진다. 이메일도 로그인 엔드포인트가
 * 없는 지금 범위에선 가입 시 1회만 쓰이므로 User 에 중복 저장하지 않는다.
 */
export interface Credential {
  userId: UserId;
  email: string;
  passwordHash: string; // node:crypto scrypt 파생값(솔트 포함, "salt:hash" 형식)
}

/** 동의 이력(F1) — 감사 추적용. User 의 locationStorageEnabled 는 이 중 location 필드로
 * 갱신되지만(AccountService.setLocationStorage 재사용), 원본 동의 기록 자체는 별도 보관. */
export interface ConsentRecord {
  userId: UserId;
  privacy: boolean;
  location: boolean;
  photo: boolean;
  consentVersion: string;
  agreedAt: string;
}
