/**
 * 백엔드 API 요청/응답 타입.
 * 「리빙도감_프론트엔드_기능명세서 v1.1」의 호출 API 스키마를 기반으로 선점 정의한다.
 * 백엔드 확정 시 조정될 수 있음.
 */

// ─── 공통 ────────────────────────────────────────────────
export type ID = string;

/** 분류 그룹(도감 필터). '기타'는 앞의 4종에 속하지 않는 종(균류·파충류 등). */
export type TaxonGroup = '곤충' | '양서류' | '식물' | '조류' | '기타';

// ─── F1. 온보딩 & 인증 (단일 사용자 계정) ─────────────────
/** 계정 생성 전에는 인증 토큰이 없어 동의를 따로 제출할 수 없다 — 가입 요청에 함께 담는다. */
export interface ConsentPayload {
  privacy: boolean;
  location: boolean;
  photo: boolean;
  consent_version: string;
}
export interface SignupRequest extends ConsentPayload {
  email: string;
  password: string;
  nickname: string;
  avatar: string;
}
export interface UserProfile {
  user_id: ID;
  email: string;
  nickname: string;
  avatar: string;
}
export interface SignupResponse {
  access_token: string;
  user: UserProfile;
}
export interface LoginRequest {
  email: string;
  password: string;
}
/** 응답 형태가 회원가입과 동일(토큰+프로필)해서 SignupResponse를 그대로 재사용한다. */
export type LoginResponse = SignupResponse;

// ─── F2. 촬영 ───────────────────────────────────────────
export interface SightingUploadResponse {
  sighting_id: ID;
  /** 결과 수신 방식 — 백엔드와 폴링/소켓 협의 필요 */
  status: 'processing' | 'done' | 'failed';
}

// ─── F4. AI 동정 ────────────────────────────────────────
export interface IdentifyCandidate {
  species_id: ID;
  confidence: number;
}
export interface IdentifyResponse {
  candidates: IdentifyCandidate[];
  is_dangerous: boolean;
  needs_user_confirmation: boolean;
}

// ─── F5. 도감 ───────────────────────────────────────────
export interface Creature {
  id: ID;
  species_id: ID;
  nickname?: string;
  discovered_at: string;
}
export interface DexEntry {
  species_id: ID;
  name: string;
  discovered: boolean;
  group: TaxonGroup;
  thumbnail?: string;
  creatures: Creature[];
}
export interface DexCompletion {
  total: number;
  discovered: number;
  percentage: number;
}

// ─── F6. 종 카드 ────────────────────────────────────────
export interface SimilarSpecies {
  species_id: ID;
  name: string;
}
export interface QuizQuestion {
  q: string;
  options: string[];
  answerIndex: number;
}
export interface SpeciesCard {
  species_id: ID;
  name: string;
  scientific_name: string;
  group: TaxonGroup;
  habitat: string;
  size: string;
  active_time: string; // 예: "낮", "밤"
  rarity: string; // 예: "흔해요", "가끔 보여요", "귀해요"
  fun_fact: string;
  observe_points: string[];
  quiz: QuizQuestion[];
  similar_species: SimilarSpecies[];
  is_dangerous: boolean;
  safety_notes?: string; // 위험 생물일 때 최상단 고정 노출 (F6)
}

/** F6 종 카드 하단 "지금까지 찍은 사진" 갤러리 항목. */
export interface SpeciesPhoto {
  observation_id: ID;
  /** API base URL을 붙여야 하는 상대 경로(`/media/:observationId`). */
  url: string;
  taken_at: string; // ISO8601
}

// ─── F16. 홈 가든 ───────────────────────────────────────
export type TileType = '잔디' | '물웅덩이' | '흙' | '돌' | '꽃밭';

export interface GardenTile {
  row: number;
  col: number;
  type: TileType;
}
export interface Placement {
  creature_id: ID;
  species_id: ID;
  row: number;
  col: number;
}
export interface GardenLayout {
  tiles: GardenTile[];
  placements: Placement[];
}
/** 분류 그룹(서식지 기반) → 배치 가능한 타일 종류. F6 서식지 데이터와 공유. */
export type TileCompatibility = Record<TaxonGroup, TileType[]>;

export interface CreatureStatus {
  creature_id: ID;
  nickname: string | null;
  /** 함께한 일수 (기준 데이터는 서버 제공, 최종 표시는 클라이언트 계산 가능) */
  days_together: number;
  bond: number;
  bond_max: number;
  /** 오늘의 상태 문구 (시간/계절 반영) */
  status_message: string;
  /** 마지막 상호작용 후 오래 지나 재회로 판정됐는지 (F9) */
  is_reunion: boolean;
}

// ─── F8. 배지 · 레벨 보상 ─────────────────────────────────
export interface XPProfile {
  level: number;
  /** 계정 생성 이후 누적된 전체 XP (레벨업해도 리셋되지 않음) */
  xp: number;
  /** 다음 레벨까지 "남은" XP (누적 요구량이 아님) */
  xp_to_next: number;
  /** 현재 레벨이 시작된 시점의 누적 XP 문턱값. (xp - xp_level_start)가 "이번 레벨 안에서의 진행량". */
  xp_level_start: number;
  /** claim 응답에서만 채워짐: 이번 claim으로 레벨업했는지 */
  leveled_up?: boolean;
}
export type BadgeTheme = '수집' | '탐험' | '우정' | '연속출석';
export interface Badge {
  badge_id: ID;
  title: string;
  description: string;
  theme: BadgeTheme;
  icon: string;
  unlocked: boolean;
  claimed: boolean;
}

// ─── F9. 친밀도(Bond) 상호작용 ────────────────────────────
export interface InteractResponse {
  bond: number;
  bond_max: number;
  /** 이번 상호작용으로 Bond 구간이 올라갔는지(모션 풀·장식 해금 트리거) */
  bond_leveled_up: boolean;
  reaction_message: string;
  /** 마지막 상호작용 후 오래 지나 재회로 판정됐는지 */
  is_reunion: boolean;
}

// ─── F10. 퀘스트 ──────────────────────────────────────────
export type QuestStatus = 'active' | 'completed' | 'claimed';
export interface Quest {
  quest_id: ID;
  title: string;
  description: string;
  /** 힌트로 연동할 종 카드(F6) */
  hint_species_id?: ID;
  progress: number;
  target: number;
  status: QuestStatus;
  reward_xp: number;
  reward_badge_id?: ID;
}

// ─── F11. 지도 & 탐험 기록 ────────────────────────────────
// v2: 일러스트 스타일 정규화 좌표(0~1) 대신 실제 카카오맵 위경도를 쓴다.
export interface MapPin {
  species_id: ID;
  species_name: string;
  group: TaxonGroup;
  lat: number;
  lng: number;
  /** 핀에 경고 배지를 띄울지(위험 태그는 서버만 알고 있다). */
  is_dangerous: boolean;
}
/** 방문 지역 시각화(blob/home_zone)는 실제 지도 전환과 함께 폐기 — 후속 과제. */
export interface ExploredRegionsResponse {
  blobs: [];
  home_zone: null;
  current_location: { lat: number; lng: number } | null;
}

// ─── F18. 설정 & 계정 관리 ───────────────────────────────
export interface RestoreBundleResponse {
  dex_count: number;
  garden_layout_present: boolean;
  restored_at: string;
}

// ─── F19. 터치 기반 사전 위험 경고 ──────────────────────
export interface PreviewScanRequest {
  /** 터치 좌표 (프리뷰 기준 정규화 0~1) */
  x: number;
  y: number;
  /** 크롭된 저해상도 이미지 (base64 또는 업로드 ref) */
  image: string;
}
export interface PreviewScanResponse {
  species_guess: string;
  is_dangerous: boolean;
  confidence: number;
}
