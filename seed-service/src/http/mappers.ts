/**
 * 도메인 ↔ REST DTO 매핑 (C단계).
 *
 * 전부 순수 함수(부수효과 없음, GPU/네트워크/DB 불필요) — `app/`이 이미 정의해둔 계약
 * (`app/src/types/api.ts`, `mockAdapter.ts`)을 원문 그대로 확인해서 맞춘 것이지 추측이 아니다.
 *
 * **간극(우리 도메인에 아직 없는 데이터)은 지어내지 않고 빈 값으로 정직하게 남긴다** —
 * `SpeciesCard.size`/`active_time`이 대표적. 어디가 빈 값인지는 각 함수 주석에 명시.
 */
import type {
  Taxon,
  TaxonGroup,
  Rarity,
  Habitat,
  ActiveTime,
  CollectionEntry,
  User,
  Creature,
} from "../core/domain/types.js";
import type { SpeciesContent } from "../child/content/ContentCardService.js";
import type { SafetyNotice } from "../core/safety/SafetyFilter.js";
import type { IdentificationOutcome } from "../core/identification/IdentificationGateway.js";
import type { Quest, QuestProgress } from "../core/quest/questTypes.js";
import type { BadgeDefinition, EarnedBadge } from "../core/rewards/rewardTypes.js";
import { xpToNextLevel, type LevelCurve } from "../core/rewards/rewardTypes.js";
import type { GardenLayout as DomainGardenLayout } from "../core/garden/gardenTypes.js";
import { TILE_TYPE_TO_KOREAN } from "../core/garden/gardenTypes.js";
import { BOND_MAX } from "../core/garden/bondRules.js";
import type { AudioSighting, AudioConfirmResult } from "../core/audio/audioTypes.js";
import type { AudioIdentificationOutcome } from "../core/audio/identification/audioIdentificationTypes.js";
import type { SimilaritySupportedOutcome } from "../core/audio/similarity/SimilarityGateway.js";
import type { SpeciesSoundReference } from "../core/audio/reference/referenceTypes.js";

// ── 공통 ────────────────────────────────────────────────────────────────
/** `app/src/types/api.ts`의 TaxonGroup — 도감 필터 UI가 쓰는 5종 분류. */
export type ApiTaxonGroup = "곤충" | "양서류" | "식물" | "조류" | "기타";

const GROUP_KOREAN: Record<TaxonGroup, ApiTaxonGroup> = {
  insect: "곤충",
  amphibian: "양서류",
  plant: "식물",
  bird: "조류",
  fungus: "기타",
  reptile: "기타",
  mammal: "기타",
  other: "기타",
};

/** 도메인 TaxonGroup(8종) → app의 5종 한글 분류. 매핑 안 되는 값은 "기타"로 수렴. */
export function taxonGroupToKorean(group: TaxonGroup): ApiTaxonGroup {
  return GROUP_KOREAN[group];
}

const RARITY_KOREAN: Record<Rarity, string> = {
  common: "흔해요",
  uncommon: "가끔 보여요",
  rare: "귀해요",
};

/** mock 데이터(`mockData.ts`)에 쓰인 문구와 동일하게 맞춤. */
export function rarityToKorean(rarity: Rarity): string {
  return RARITY_KOREAN[rarity];
}

const HABITAT_KOREAN: Record<Habitat, string> = {
  neighborhood: "우리 동네",
  park: "공원",
  mountain: "산",
  waterside: "물가",
  garden: "화단·정원",
  field: "들판",
};

/** Habitat[] 태그를 "공원·들판" 같은 표시용 문자열로. 빈 배열이면 빈 문자열. */
export function habitatTagsToDisplay(tags: Habitat[]): string {
  return tags.map((t) => HABITAT_KOREAN[t]).join("·");
}

const ACTIVE_TIME_KOREAN: Record<ActiveTime, string> = {
  day: "낮",
  night: "밤",
  both: "낮·밤",
};

/** app/src/screens/dex/SpeciesCardScreen.tsx의 ACTIVE_TIME_ICON 키와 동일한 문구여야 함. */
export function activeTimeToKorean(activeTime: ActiveTime | undefined): string {
  return activeTime ? ACTIVE_TIME_KOREAN[activeTime] : "";
}

// ── F6. 종 카드 ────────────────────────────────────────────────────────
export interface ApiSimilarSpecies {
  species_id: string;
  name: string;
}
export interface ApiQuizQuestion {
  q: string;
  options: string[];
  answerIndex: number;
}
export interface ApiSpeciesCard {
  species_id: string;
  name: string;
  scientific_name: string;
  group: ApiTaxonGroup;
  habitat: string;
  size: string;
  active_time: string;
  rarity: string;
  fun_fact: string;
  observe_points: string[];
  quiz: ApiQuizQuestion[];
  similar_species: ApiSimilarSpecies[];
  is_dangerous: boolean;
  safety_notes?: string;
}

export function taxonToSpeciesCard(
  taxon: Taxon,
  content: SpeciesContent | null,
  safety: SafetyNotice | null,
  // confusionPairs.ts 기반으로 라우트가 미리 조회해둔 혼동 종(Taxon). DB 조회는 라우트가
  // 하고 이 함수는 순수 함수로 유지한다(파일 상단 원칙). 없으면 빈 배열.
  similarTaxa: Taxon[] = [],
): ApiSpeciesCard {
  return {
    species_id: taxon.id as string,
    name: taxon.korName || taxon.sciName,
    scientific_name: taxon.sciName,
    group: taxonGroupToKorean(taxon.group),
    habitat: habitatTagsToDisplay(taxon.habitatTags),
    // 값이 없으면(콘텐츠 미비 종) 지어내지 않고 빈 문자열로 정직하게 남긴다.
    size: taxon.sizeDescription ?? "",
    active_time: activeTimeToKorean(taxon.activeTime),
    rarity: rarityToKorean(taxon.rarity),
    fun_fact: content?.funFact ?? "",
    observe_points: content?.observePoints ?? [],
    quiz: content?.quiz ?? [],
    similar_species: similarTaxa.map((t) => ({
      species_id: t.id as string,
      name: t.korName || t.sciName,
    })),
    is_dangerous: safety !== null,
    safety_notes: safety?.message,
  };
}

// ── F5. 도감 ───────────────────────────────────────────────────────────
export interface ApiCreature {
  id: string;
  species_id: string;
  nickname?: string;
  discovered_at: string;
}
export interface ApiDexEntry {
  species_id: string;
  name: string;
  discovered: boolean;
  group: ApiTaxonGroup;
  thumbnail?: string;
  creatures: ApiCreature[];
}
export interface ApiDexCompletion {
  total: number;
  discovered: number;
  percentage: number;
}

/** 개체(Creature, D단계) → ApiCreature. */
export function creatureToApiCreature(c: Creature): ApiCreature {
  return {
    id: c.id as string,
    species_id: c.taxonId as string,
    nickname: c.nickname,
    discovered_at: c.createdAt,
  };
}

/**
 * 종 + (있으면) 도감 기록 + 실제 개체 목록 → DexEntry. 이름은 미해금 종도 그대로 노출한다
 * (도감 목록에서 "무엇을 찾아야 하는지" 알 수 있게) — 실루엣/사진/재미있는 사실 등 나머지
 * 상세 정보만 발견 전에는 숨긴다(SpeciesGridCard 잠금 UI, 종 카드 화면). D단계부터
 * `creatures`는 합성이 아니라 실제 `Creature` 레코드다(종당 최대 1마리 —
 * ObservationFlow.recordIdentification이 첫 해금 때만 생성).
 */
export function collectionEntryToDexEntry(
  taxon: Taxon,
  entry: CollectionEntry | null,
  creatures: Creature[] = [],
): ApiDexEntry {
  const discovered = entry?.unlocked ?? false;
  return {
    species_id: taxon.id as string,
    name: taxon.korName || taxon.sciName,
    discovered,
    group: taxonGroupToKorean(taxon.group),
    creatures: discovered ? creatures.map(creatureToApiCreature) : [],
  };
}

export function buildDexCompletion(
  totalCount: number,
  unlockedCount: number,
): ApiDexCompletion {
  return {
    total: totalCount,
    discovered: unlockedCount,
    percentage: totalCount === 0 ? 0 : Math.round((unlockedCount / totalCount) * 100),
  };
}

// ── F4. AI 동정 ────────────────────────────────────────────────────────
export interface ApiIdentifyCandidate {
  species_id: string;
  confidence: number;
}
export interface ApiIdentifyResponse {
  candidates: ApiIdentifyCandidate[];
  is_dangerous: boolean;
  needs_user_confirmation: boolean;
}

/**
 * needs_user_confirmation = tier==='medium'(후보 중 고르기 화면) 일 때만 true.
 * fallback(상위 분류)/unknown 은 candidates 가 비어있거나(unknown) 종 단위가 아닌 상위
 * 분류군 1개(fallback)일 수 있다 — 후자는 species_id 자리에 상위 taxonId 가 들어간다는
 * 걸 호출부가 알아야 한다(거짓 데이터는 아니지만 '종'은 아님).
 */
export function outcomeToIdentifyResponse(
  outcome: IdentificationOutcome,
): ApiIdentifyResponse {
  const candidates = outcome.candidates
    .filter((c) => c.taxon !== null)
    .map((c) => ({ species_id: c.taxon!.id as string, confidence: c.confidence }));
  return {
    candidates,
    is_dangerous: outcome.safety !== null,
    needs_user_confirmation: outcome.tier === "medium",
  };
}

// ── F19. 터치 기반 사전 위험 경고 ─────────────────────────────────────────
export interface ApiPreviewScanResponse {
  species_guess: string;
  is_dangerous: boolean;
  confidence: number;
}

/**
 * F19 프리뷰 스캔 응답. outcomeToIdentifyResponse(F4)와 달리 이건 화면에 바로 보여줄
 * 이름(species_guess)을 돌려준다 — species_id가 아니다(도감에 등록되는 게 아니라 잠정
 * 추정치 표시일 뿐이므로). top이 없으면(unknown) 모른다는 사실을 정직하게 채운다.
 */
export function buildPreviewScanResponse(
  outcome: IdentificationOutcome,
): ApiPreviewScanResponse {
  if (!outcome.top) {
    return { species_guess: "?", is_dangerous: false, confidence: 0 };
  }
  return {
    species_guess: outcome.top.displayName,
    is_dangerous: outcome.safety !== null,
    confidence: outcome.top.confidence,
  };
}

// ── F1/F18 ─────────────────────────────────────────────────────────────
export interface ApiUserProfile {
  user_id: string;
  email: string;
  nickname: string;
  avatar: string;
}
export interface ApiSignupResponse {
  access_token: string;
  user: ApiUserProfile;
}

export function buildSignupResponse(
  accessToken: string,
  user: User,
  email: string,
): ApiSignupResponse {
  return {
    access_token: accessToken,
    user: {
      user_id: user.id as string,
      email,
      nickname: user.nickname,
      avatar: user.avatar,
    },
  };
}

export interface ApiRestoreBundleResponse {
  dex_count: number;
  garden_layout_present: boolean;
  restored_at: string;
}

/** garden_layout_present 는 항상 false — 홈가든 도메인 자체가 아직 없다(정직한 값). */
export function buildRestoreBundle(
  dexCount: number,
  now: Date = new Date(),
): ApiRestoreBundleResponse {
  return { dex_count: dexCount, garden_layout_present: false, restored_at: now.toISOString() };
}

// ── F8. 배지 · 레벨 보상 (D단계) ──────────────────────────────────────────
export interface ApiXpProfile {
  level: number;
  xp: number;
  xp_to_next: number;
  /**
   * 현재 레벨이 시작된 시점의 누적 XP 문턱값(= curve.thresholds[level-1]).
   * 프론트가 "이번 레벨 안에서의 진행률"(xp - xp_level_start) / ((xp - xp_level_start) +
   * xp_to_next)을 계산하려면 이 기준선이 필요하다 — xp/xp_to_next 둘 다 누적 XP 기준이라
   * 기준선 없이는 프론트가 레벨 내 진행률을 재구성할 수 없다(실제로 XPBar가 이 기준선 없이
   * xp를 xp_to_next로 나누다가 "49/1 XP" 같은 무의미한 값을 표시하던 버그의 원인이었다).
   */
  xp_level_start: number;
  leveled_up?: boolean;
}

export function buildXpProfile(
  user: User,
  curve: LevelCurve,
  leveledUp?: boolean,
): ApiXpProfile {
  return {
    level: user.level,
    xp: user.xp,
    xp_to_next: xpToNextLevel(user.xp, curve),
    xp_level_start: curve.thresholds[user.level - 1] ?? 0,
    leveled_up: leveledUp,
  };
}

export interface ApiBadge {
  badge_id: string;
  title: string;
  description: string;
  theme: string;
  icon: string;
  unlocked: boolean;
  claimed: boolean;
}

/** 전체 배지 정의 + (있으면) 이 사용자의 해금 기록 → ApiBadge. earned가 없으면 잠긴 상태. */
export function badgeDefToApiBadge(def: BadgeDefinition, earned: EarnedBadge | null): ApiBadge {
  return {
    badge_id: def.id,
    title: def.title,
    description: def.description,
    theme: def.theme,
    icon: def.icon,
    unlocked: earned !== null,
    claimed: earned?.claimedAt !== undefined,
  };
}

// ── F10. 퀘스트 (D단계) ───────────────────────────────────────────────────
export type ApiQuestStatus = "active" | "completed" | "claimed";

export interface ApiQuest {
  quest_id: string;
  title: string;
  description: string;
  hint_species_id?: string;
  progress: number;
  target: number;
  status: ApiQuestStatus;
  reward_xp: number;
  reward_badge_id?: string;
}

/**
 * Quest + (있으면) 이 사용자의 진행 상태 → ApiQuest.
 * `hint_species_id`는 지어내지 않고 비워둔다 — QuestCriteria는 특정 종 하나가 아니라
 * 그룹/계절/태그 같은 추상 조건이라, 힌트로 삼을 단일 taxonId가 도메인에 없다.
 */
export function questToApiQuest(quest: Quest, progress: QuestProgress | null): ApiQuest {
  const status: ApiQuestStatus = progress?.claimedAt
    ? "claimed"
    : progress?.completed
      ? "completed"
      : "active";
  return {
    quest_id: quest.id,
    title: quest.title,
    description: quest.description,
    progress: progress?.matchedTaxonIds.length ?? 0,
    target: quest.criteria.distinctTaxa,
    status,
    reward_xp: quest.reward.xp,
    reward_badge_id: quest.reward.badgeId,
  };
}

// ── F16. 홈 가든 ───────────────────────────────────────────────────────
export interface ApiGardenTile {
  row: number;
  col: number;
  type: string; // 한글 라벨(잔디/물웅덩이/흙/돌/꽃밭) — app/src/types/api.ts TileType
}
export interface ApiPlacement {
  creature_id: string;
  species_id: string;
  placement_mode: "slot" | "free";
  row?: number;
  col?: number;
  world_x?: number;
  world_y?: number;
  world_z?: number;
}
export interface ApiGardenLayout {
  tiles: ApiGardenTile[];
  placements: ApiPlacement[];
}

/**
 * 도메인 GardenLayout(영문 타일 코드, creatureId만) → API DTO(한글 라벨, species_id 포함).
 * placements는 creature_id→taxonId를 미리 조회해서 넘겨받는다(이 함수 자체는 순수 함수로
 * 유지 — DB 조회는 라우트가 한다, mappers.ts 파일 상단 원칙과 동일).
 */
export function gardenLayoutToApi(
  layout: DomainGardenLayout,
  taxonIdByCreatureId: Map<string, string>,
): ApiGardenLayout {
  return {
    tiles: layout.tiles.map((t) => ({ row: t.row, col: t.col, type: TILE_TYPE_TO_KOREAN[t.type] })),
    placements: layout.placements
      .filter((p) => taxonIdByCreatureId.has(p.creatureId as string))
      .map((p) => ({
        creature_id: p.creatureId as string,
        species_id: taxonIdByCreatureId.get(p.creatureId as string)!,
        placement_mode: p.placementMode ?? "slot",
        ...(p.placementMode === "free"
          ? {
              world_x: p.worldX,
              world_y: p.worldY,
              world_z: p.worldZ,
            }
          : { row: p.row, col: p.col }),
      })),
  };
}

// ── F9. 친밀도(Bond) ───────────────────────────────────────────────────
export interface ApiCreatureStatus {
  creature_id: string;
  nickname: string | null;
  days_together: number;
  bond: number;
  bond_max: number;
  status_message: string;
  is_reunion: boolean;
}

export function buildCreatureStatus(params: {
  creatureId: string;
  nickname: string | null;
  daysTogether: number;
  bond: number;
  reunion: boolean;
  message: string;
}): ApiCreatureStatus {
  return {
    creature_id: params.creatureId,
    nickname: params.nickname,
    days_together: params.daysTogether,
    bond: params.bond,
    bond_max: BOND_MAX,
    status_message: params.message,
    is_reunion: params.reunion,
  };
}

export interface ApiInteractResponse {
  bond: number;
  bond_max: number;
  bond_leveled_up: boolean;
  reaction_message: string;
  is_reunion: boolean;
}

export function buildInteractResponse(params: {
  bond: number;
  bondLeveledUp: boolean;
  reactionMessage: string;
  wasReunion: boolean;
}): ApiInteractResponse {
  return {
    bond: params.bond,
    bond_max: BOND_MAX,
    bond_leveled_up: params.bondLeveledUp,
    reaction_message: params.reactionMessage,
    is_reunion: params.wasReunion,
  };
}

// ── F11. 지도 & 탐험 기록 ─────────────────────────────────────────────────
// 실제 지도(카카오맵) 위에 찍을 핀이라 정규화 좌표가 아니라 위도/경도 그대로 쓴다
// (일러스트 지도 시절의 MapBlob/HomeZone 개념은 실제 지도에는 안 맞아 폐기 — 방문
// 지역 시각화는 후속 과제로 남긴다, ExploredRegionsResponse 주석 참고).
export interface ApiMapPin {
  species_id: string;
  species_name: string;
  group: ApiTaxonGroup;
  lat: number;
  lng: number;
  /** 지도 핀에 경고 배지를 띄울지. 위험 태그는 서버만 알고 있으므로 여기서 내려준다. */
  is_dangerous: boolean;
}

export function buildMapPin(taxon: Taxon, lat: number, lng: number): ApiMapPin {
  return {
    species_id: taxon.id as string,
    species_name: taxon.korName || taxon.sciName,
    group: taxonGroupToKorean(taxon.group),
    lat,
    lng,
    is_dangerous: taxon.riskTags.length > 0,
  };
}

export interface ApiExploredRegionsResponse {
  /** 일러스트 지도의 "탐험 구역" 블롭 — 실제 지도로 전환하며 폐기, 항상 빈 배열.
   * 방문 지역을 실제 지도 위에 원/히트맵으로 표시하는 건 후속 과제(TODO). */
  blobs: [];
  home_zone: null;
  current_location: { lat: number; lng: number } | null;
}

export function buildExploredRegions(
  currentLocation: { lat: number; lng: number } | null,
): ApiExploredRegionsResponse {
  return { blobs: [], home_zone: null, current_location: currentLocation };
}

// ── 소리 기능(오디오) 3단계 ─────────────────────────────────────────────
/** `docs/audio/API_CONTRACT.md`의 `POST /audio/sightings/upload` 성공 응답
 * (`fixtures/upload-success.json`과 필드 1:1 대응). */
export function audioSightingToUploadResponse(sighting: AudioSighting) {
  return {
    audio_sighting_id: sighting.id,
    status: sighting.status,
    quality: {
      usable: sighting.quality.usable,
      duration_ms: sighting.quality.durationMs,
      active_duration_ms: sighting.quality.activeDurationMs,
      snr_db: sighting.quality.snrDb,
      clipping_ratio: sighting.quality.clippingRatio,
      silence_ratio: sighting.quality.silenceRatio,
      speech_ratio: sighting.quality.speechRatio,
      feedback_codes: sighting.quality.feedbackCodes,
      valid_segments: sighting.quality.validSegments.map((s) => ({
        start_ms: s.startMs,
        end_ms: s.endMs,
        quality_score: s.qualityScore,
      })),
    },
    expires_at: sighting.expiresAt,
  };
}

// ── 소리 기능(오디오) 6단계 ─────────────────────────────────────────────
/** `docs/audio/API_CONTRACT.md` §2의 `POST /audio/identify` 성공 응답 —
 * `fixtures/identify-high-confidence.json`/`identify-multiple-candidates.json`/
 * `identify-unknown.json` 세 개와 필드 1:1 대응(unknown_reason은 unknown일 때만 존재). */
export function audioIdentificationOutcomeToResponse(
  audioSightingId: string,
  outcome: AudioIdentificationOutcome,
) {
  const body: Record<string, unknown> = {
    audio_sighting_id: audioSightingId,
    candidates: outcome.candidates.map((c) => ({
      species_id: c.speciesId,
      common_name_ko: c.commonNameKo,
      scientific_name: c.scientificName,
      confidence: c.confidence,
      confidence_level: c.confidenceLevel,
      start_ms: c.startMs,
      end_ms: c.endMs,
      is_dangerous: c.isDangerous,
      supported: c.supported,
    })),
    unknown: outcome.unknown,
    needs_user_confirmation: outcome.needsUserConfirmation,
    model_version: outcome.modelVersion,
    location_prior_used: outcome.locationPriorUsed,
  };
  if (outcome.unknown) body.unknown_reason = outcome.unknownReason;
  return body;
}

// ── 소리 기능(오디오) 7단계 ─────────────────────────────────────────────
/** `docs/audio/API_CONTRACT.md` §3의 `POST /audio/identify/confirm` 성공 응답 —
 * `fixtures/confirm-success.json`과 필드 1:1 대응. 새로 만든 결과든(최초 확정) 저장해둔
 * 스냅샷을 재생하는 것이든(멱등 재요청) 이 함수 하나로 직렬화한다 — 둘 다 같은
 * `AudioConfirmResult` 모양이라 응답이 항상 동일하다는 걸 타입으로 보장한다. */
export function audioConfirmResultToResponse(result: AudioConfirmResult) {
  return {
    observation_id: result.observationId,
    modality: "audio" as const,
    species_id: result.speciesId,
    dex_updated: result.dexUpdated,
    reward: {
      xp: result.reward.xp,
      quest_ids: result.reward.questIds,
    },
  };
}

// ── 소리 기능(오디오) 8단계 ─────────────────────────────────────────────
/** `docs/audio/API_CONTRACT.md` §4의 `POST /audio/similarity/score` 성공 응답 —
 * `fixtures/similarity-success.json`과 필드 1:1 대응. */
export function audioSimilarityScoreToResponse(
  audioSightingId: string,
  speciesId: string,
  outcome: SimilaritySupportedOutcome,
) {
  return {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    score: outcome.score,
    grade: outcome.grade,
    score_reliability: outcome.scoreReliability,
    matched_segment: { start_ms: outcome.matchedSegment.startMs, end_ms: outcome.matchedSegment.endMs },
    feedback_codes: outcome.feedbackCodes,
    model_version: outcome.modelVersion,
    reference_set_version: outcome.referenceSetVersion,
  };
}

/** `docs/audio/API_CONTRACT.md` §5의 `GET /species/:species_id/sounds` 성공 응답.
 * `playbackUrlFor`는 라우트가 만든 단기 서명 URL 생성 함수(순수 함수 원칙 유지 — 서명은
 * 시크릿이 필요해 이 파일이 직접 하지 않는다). */
export function speciesSoundsToResponse(
  speciesId: string,
  refs: SpeciesSoundReference[],
  playbackUrlFor: (ref: SpeciesSoundReference) => string,
) {
  const approved = refs.filter((r) => r.qualityStatus === "approved");
  return {
    species_id: speciesId,
    supported_for_similarity: approved.length > 0,
    reference_set_version: approved[0]?.referenceSetVersion ?? "",
    clips: approved.map((r) => ({
      id: r.id,
      call_type: r.callType,
      duration_ms: r.durationMs,
      playback_url: playbackUrlFor(r),
      attribution: r.attribution,
      license: r.license,
      source_url: r.sourceUrl,
    })),
  };
}
