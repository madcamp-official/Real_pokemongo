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
  CollectionEntry,
  User,
} from "../core/domain/types.js";
import type { SpeciesContent } from "../child/content/ContentCardService.js";
import type { SafetyNotice } from "../core/safety/SafetyFilter.js";
import type { IdentificationOutcome } from "../core/identification/IdentificationGateway.js";

// ── 공통 ────────────────────────────────────────────────────────────────
/** `app/src/types/api.ts`의 TaxonGroup — 우리 8종보다 좁은 4종 분류. */
export type ApiTaxonGroup = "곤충" | "양서류" | "식물" | "기타";

const GROUP_KOREAN: Record<TaxonGroup, ApiTaxonGroup> = {
  insect: "곤충",
  amphibian: "양서류",
  plant: "식물",
  fungus: "기타",
  bird: "기타",
  reptile: "기타",
  mammal: "기타",
  other: "기타",
};

/** 우리 8종 TaxonGroup → app의 4종 한글 분류. 매핑 안 되는 값은 전부 "기타"로 수렴. */
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

// ── F6. 종 카드 ────────────────────────────────────────────────────────
export interface ApiSimilarSpecies {
  species_id: string;
  name: string;
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
  similar_species: ApiSimilarSpecies[];
  is_dangerous: boolean;
  safety_notes?: string;
}

export function taxonToSpeciesCard(
  taxon: Taxon,
  content: SpeciesContent | null,
  safety: SafetyNotice | null,
): ApiSpeciesCard {
  return {
    species_id: taxon.id as string,
    name: taxon.korName || taxon.sciName,
    scientific_name: taxon.sciName,
    group: taxonGroupToKorean(taxon.group),
    habitat: habitatTagsToDisplay(taxon.habitatTags),
    // size/active_time: 지금 도메인(Taxon)에 아예 없는 필드. 없는 데이터를 지어내지 않고
    // 빈 문자열로 정직하게 남긴다 — 종 목록 확장 작업(국가생물종지식정보시스템 연동)에서 채울 것.
    size: "",
    active_time: "",
    rarity: rarityToKorean(taxon.rarity),
    fun_fact: content?.funFact ?? "",
    // SpeciesContent.similarSpecies 는 이름 문자열뿐 실제 taxonId 연결이 없다.
    // 임시로 이름 자체를 species_id 로 사용(추후 실제 Taxon 연결 필요).
    similar_species: (content?.similarSpecies ?? []).map((name) => ({
      species_id: name,
      name,
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

/**
 * 종 + (있으면) 도감 기록 → DexEntry. 미해금 종은 mock 관례와 동일하게 name="???".
 *
 * `creatures`: 지금 `CollectionEntry`는 종 단위 unlock 여부만 추적하고, app이 기대하는
 * "개체(Creature) 여러 마리 각각 작명" 모델은 아직 없다(F16 홈가든 도메인이 생기면 대체).
 * 해금된 종마다 합성 개체 1개(작명 없음)만 만들어 구조를 맞춘다 — 거짓 데이터가 아니라
 * "지금 갖고 있는 만큼만" 정직하게 반영한 것.
 */
export function collectionEntryToDexEntry(
  taxon: Taxon,
  entry: CollectionEntry | null,
): ApiDexEntry {
  const discovered = entry?.unlocked ?? false;
  return {
    species_id: taxon.id as string,
    name: discovered ? taxon.korName || taxon.sciName : "???",
    discovered,
    group: taxonGroupToKorean(taxon.group),
    creatures:
      discovered && entry
        ? [
            {
              id: taxon.id as string,
              species_id: taxon.id as string,
              discovered_at: entry.firstObservedAt ?? "",
            },
          ]
        : [],
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
