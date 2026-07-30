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

// ─── Audio MVP: 소리 기반 동정 · 유사도 ──────────────────
export type AudioQualityFeedbackCode =
  | 'TOO_SHORT'
  | 'MOSTLY_SILENCE'
  | 'TOO_NOISY'
  | 'CLIPPED'
  | 'SPEECH_DETECTED'
  | 'MULTIPLE_OVERLAP'
  | 'UNSUPPORTED_SOUND'
  | 'NO_TARGET_ACTIVITY';

export interface AudioValidSegment {
  start_ms: number;
  end_ms: number;
  quality_score: number;
}

export interface AudioQualityResult {
  usable: boolean;
  duration_ms: number;
  active_duration_ms: number;
  snr_db: number | null;
  clipping_ratio: number;
  silence_ratio: number;
  speech_ratio: number | null;
  feedback_codes: AudioQualityFeedbackCode[];
  valid_segments: AudioValidSegment[];
}

export interface AudioSightingUploadResponse {
  audio_sighting_id: ID;
  status: 'ready' | 'rejected';
  quality: AudioQualityResult;
  expires_at: string;
}

export interface AudioIdentifyCandidate {
  /** CR-20260729-species-outside-db: supported=false면 null(도감 DB 밖 종 — 모델 원시 라벨만 있음). */
  species_id: ID | null;
  common_name_ko: string;
  scientific_name: string;
  confidence: number;
  confidence_level: 'high' | 'medium' | 'low';
  start_ms: number;
  end_ms: number;
  is_dangerous: boolean;
  /** false면 도감에 없는 종 — "기록하기"/"소리 비교하기"를 비활성화해야 한다. */
  supported: boolean;
}

export interface AudioIdentifyResponse {
  audio_sighting_id: ID;
  candidates: AudioIdentifyCandidate[];
  unknown: boolean;
  unknown_reason?: string;
  needs_user_confirmation: boolean;
  model_version: string;
  location_prior_used: boolean;
}

export interface AudioConfirmResponse {
  observation_id: ID;
  modality: 'audio';
  species_id: ID;
  dex_updated: boolean;
  reward: { xp: number; quest_ids: ID[] };
}

export interface AudioSimilarityResponse {
  audio_sighting_id: ID;
  species_id: ID;
  score: number;
  grade: 'low_similarity' | 'somewhat_similar' | 'very_similar' | 'strong_match';
  score_reliability: 'high' | 'medium' | 'low';
  matched_segment: { start_ms: number; end_ms: number };
  feedback_codes: AudioQualityFeedbackCode[];
  model_version: string;
  reference_set_version: string;
}

export interface SpeciesSoundClip {
  id: ID;
  call_type: string;
  duration_ms: number;
  playback_url: string;
  attribution: string;
  license: string;
  source_url: string;
}

export interface SpeciesSoundsResponse {
  species_id: ID;
  supported_for_similarity: boolean;
  reference_set_version: string;
  clips: SpeciesSoundClip[];
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

// ─── F22. 도감 박사 ──────────────────────────────────────
export type ProfessorConfidence = 'high' | 'medium' | 'low' | 'unknown';
export interface ProfessorMatchedSpecies {
  species_id: ID;
  name: string;
  discovered: boolean;
}
export interface ProfessorRelatedSpecies {
  species_id: ID;
  name: string;
  reason: string;
}
export interface ProfessorAskResponse {
  confidence: ProfessorConfidence;
  answer: string;
  matched_species: ProfessorMatchedSpecies | null;
  safety_warning: string | null;
  related: ProfessorRelatedSpecies[];
  similarity_score: number | null;
  restricted: boolean;
  response_source: 'indexed_sentence' | 'fixed_safety' | 'small_talk' | 'unknown';
}
export interface ProfessorSuggestion {
  id: string;
  question: string;
  context_species_id?: ID;
}
export interface ProfessorGreeting {
  message: string;
  discovered_count: number;
}

/** F6 종 카드 하단 "지금까지 찍은 사진" 갤러리 항목. */
export interface SpeciesPhoto {
  observation_id: ID;
  /** API base URL을 붙여야 하는 상대 경로(`/media/:observationId`). */
  url: string;
  taken_at: string; // ISO8601
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
