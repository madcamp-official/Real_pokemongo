import type { CollectionRepository, TaxonRepository } from "../repositories/ports.js";
import { SafetyFilter } from "../safety/SafetyFilter.js";
import type { Taxon, TaxonId, UserId } from "../domain/types.js";
import { SemanticSearch, type SearchResult } from "./SemanticSearch.js";
import {
  DEFAULT_PROFESSOR_THRESHOLDS,
  type ProfessorAskInput,
  type ProfessorAskResponse,
  type ProfessorConfidence,
  type ProfessorGreeting,
  type ProfessorSuggestion,
  type ProfessorThresholds,
} from "./professorTypes.js";

const EDIBILITY_PATTERN =
  /(먹어|먹을\s*수|먹어도|식용|섭취|요리|삶아|구워|맛있|독버섯|독\s*없|사람이\s*먹)/u;
const SAFE_OBSERVATION_PATTERN = /(안전.*관찰|관찰.*안전|안전하게.*봐)/u;

const FIXED_EDIBILITY_ANSWER =
  "사진이나 설명만으로 먹어도 되는지 판단하면 위험해요. 어떤 생물이든 입에 넣지 말고, 가까운 어른에게 꼭 알려 주세요.";
const FIXED_OBSERVATION_ANSWER =
  "생물은 손대지 말고 눈으로 관찰해요. 벌이나 낯선 생물은 거리를 두고, 위험해 보이면 가까운 어른에게 알려 주세요.";
const UNKNOWN_ANSWER =
  "아직 그 질문에 딱 맞는 내용을 찾지 못했어요. 생김새, 사는 곳, 활동 시간처럼 한 가지를 짧게 물어봐 주세요.";

const REASON_BY_FIELD: Record<string, string> = {
  habitat: "사는 곳이 관련 있어요",
  diet: "먹이 정보가 관련 있어요",
  activity: "활동 시간이 관련 있어요",
  sound: "소리가 관련 있어요",
  size: "크기가 관련 있어요",
  season: "관찰 계절이 관련 있어요",
  safety: "안전 정보가 관련 있어요",
  funfact: "재미있는 사실이 관련 있어요",
  observation: "관찰 포인트가 관련 있어요",
  similar: "비슷한 생물이에요",
};

export class ProfessorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfessorInputError";
  }
}

export class ProfessorUnavailableError extends Error {
  constructor(
    message = "도감 박사가 잠시 생각을 정리하고 있어요. 잠시 후 다시 시도해 주세요.",
  ) {
    super(message);
    this.name = "ProfessorUnavailableError";
  }
}

export interface ProfessorServiceDependencies {
  search: SemanticSearch | null;
  taxa: TaxonRepository;
  collection: CollectionRepository;
  unavailableReason?: string;
  thresholds?: ProfessorThresholds;
}

export class ProfessorService {
  private readonly safety = new SafetyFilter();
  private readonly thresholds: ProfessorThresholds;

  constructor(private readonly deps: ProfessorServiceDependencies) {
    this.thresholds = deps.thresholds ?? DEFAULT_PROFESSOR_THRESHOLDS;
  }

  async ask(input: ProfessorAskInput): Promise<ProfessorAskResponse> {
    const question = normalizeQuestion(input.question);
    if (EDIBILITY_PATTERN.test(question)) {
      return {
        confidence: "high",
        answer: FIXED_EDIBILITY_ANSWER,
        matched_species: null,
        safety_warning: FIXED_EDIBILITY_ANSWER,
        related: [],
        similarity_score: null,
        restricted: false,
        response_source: "fixed_safety",
      };
    }
    if (SAFE_OBSERVATION_PATTERN.test(question)) {
      return {
        confidence: "high",
        answer: FIXED_OBSERVATION_ANSWER,
        matched_species: null,
        safety_warning: FIXED_OBSERVATION_ANSWER,
        related: [],
        similarity_score: null,
        restricted: false,
        response_source: "fixed_safety",
      };
    }
    if (!this.deps.search) {
      throw new ProfessorUnavailableError(this.deps.unavailableReason);
    }

    const namedTaxon = await this.findNamedTaxon(question);
    const searchSpeciesId =
      (namedTaxon?.id as string | undefined) ??
      (input.contextSpeciesId as string | undefined);
    const results = await this.deps.search.search(question, searchSpeciesId, 8);
    const best = results[0];
    if (!best || best.score < this.thresholds.low) {
      return unknownResponse(best?.score ?? null);
    }

    const taxon = await this.deps.taxa.get(best.record.species_id as TaxonId);
    if (!taxon) return unknownResponse(best.score);
    const collection = await this.deps.collection.get(input.userId, taxon.id);
    const discovered = collection?.unlocked ?? false;
    const safety = this.safety.evaluate(taxon);

    // 2026-07-29: 미발견 종도 도감 박사가 모든 정보를 설명할 수 있도록 사용자(계약 소유자)
    // 요청으로 발견 여부에 따른 답변 차단을 제거했다. 이름/사실 노출은 항상 허용하고,
    // matched_species.discovered로만 "아직 도감에 등록되지 않았다"는 걸 알려준다
    // (앱은 이 값을 보고 종 카드 링크 대신 미등록 안내를 보여준다 — ProfessorScreen.tsx).
    return {
      confidence: confidenceForScore(best.score, this.thresholds),
      answer: best.record.sentence,
      matched_species: {
        species_id: taxon.id as string,
        name: taxon.korName || taxon.sciName,
        discovered,
      },
      safety_warning: safety?.message ?? null,
      related: await this.visibleRelated(results.slice(1), taxon.id),
      similarity_score: roundScore(best.score),
      restricted: false,
      response_source: "indexed_sentence",
    };
  }

  async suggestions(userId: UserId): Promise<ProfessorSuggestion[]> {
    const entries = (await this.deps.collection.listByUser(userId)).filter((entry) => entry.unlocked);
    const suggestions: ProfessorSuggestion[] = [
      { id: "safe-observation", question: "생물을 안전하게 관찰하려면 어떻게 해야 해?" },
      { id: "season", question: "지금 계절에는 어떤 친구를 관찰하기 좋아?" },
    ];
    for (const entry of entries.slice(0, 2)) {
      const taxon = await this.deps.taxa.get(entry.taxonId);
      if (!taxon) continue;
      const name = taxon.korName || taxon.sciName;
      suggestions.unshift({
        id: `species-${taxon.id}`,
        question: `${name}${topicParticleFor(name)} 어디에서 살아요?`,
        context_species_id: taxon.id as string,
      });
    }
    return suggestions.slice(0, 4);
  }

  async greeting(userId: UserId): Promise<ProfessorGreeting> {
    const discoveredCount = (await this.deps.collection.listByUser(userId)).filter(
      (entry) => entry.unlocked,
    ).length;
    return {
      discovered_count: discoveredCount,
      message:
        discoveredCount === 0
          ? "반가워요! 생물을 발견하면 도감에 있는 사실을 함께 찾아볼 수 있어요."
          : `${discoveredCount}종의 친구를 만났군요! 궁금한 생물 이야기를 물어보세요.`,
    };
  }

  private async findNamedTaxon(question: string): Promise<Taxon | null> {
    const matches = (await this.deps.taxa.list())
      .filter((taxon) => questionMentionsTaxon(question, taxon))
      .sort((left, right) => longestTaxonName(right) - longestTaxonName(left));
    return matches[0] ?? null;
  }

  private async visibleRelated(
    results: readonly SearchResult[],
    matchedTaxonId: TaxonId,
  ) {
    const related: Array<{ species_id: string; name: string; reason: string }> = [];
    const seen = new Set<string>([matchedTaxonId as string]);
    for (const result of results) {
      if (seen.has(result.record.species_id)) continue;
      seen.add(result.record.species_id);
      const taxon = await this.deps.taxa.get(result.record.species_id as TaxonId);
      if (!taxon) continue;
      related.push({
        species_id: taxon.id as string,
        name: taxon.korName || taxon.sciName,
        reason: REASON_BY_FIELD[result.record.field_type] ?? "관련 있는 친구예요",
      });
      if (related.length >= 3) break;
    }
    return related;
  }
}

function longestTaxonName(taxon: Taxon): number {
  return Math.max(
    ...[taxon.korName, taxon.sciName, ...(taxon.aliases ?? [])].map(
      (name) => normalizeForTaxonMatch(name).length,
    ),
  );
}

function questionMentionsTaxon(question: string, taxon: Taxon): boolean {
  const comparableQuestion = normalizeForTaxonMatch(question);
  const names = [taxon.korName, taxon.sciName, ...(taxon.aliases ?? [])];
  return names.some((name) => {
    const comparableName = normalizeForTaxonMatch(name);
    return comparableName.length >= 2 && comparableQuestion.includes(comparableName);
  });
}

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_JONGSEONG_COUNT = 28;

/** 이름의 마지막 글자 받침 유무로 "은"/"는" 중 맞는 조사를 고른다(받침 있으면 "은"). */
function topicParticleFor(name: string): string {
  const lastCode = name.trim().charCodeAt(name.trim().length - 1);
  if (lastCode < HANGUL_SYLLABLE_START || lastCode > HANGUL_SYLLABLE_END) return "는";
  const hasBatchim = (lastCode - HANGUL_SYLLABLE_START) % HANGUL_JONGSEONG_COUNT !== 0;
  return hasBatchim ? "은" : "는";
}

function normalizeForTaxonMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\-_.·'’()]/g, "");
}

function normalizeQuestion(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length < 2) {
    throw new ProfessorInputError("질문을 두 글자 이상 입력해 주세요.");
  }
  if (normalized.length > 200) {
    throw new ProfessorInputError("질문은 200자 이내로 입력해 주세요.");
  }
  return normalized;
}

function confidenceForScore(
  score: number,
  thresholds: ProfessorThresholds,
): ProfessorConfidence {
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";
  if (score >= thresholds.low) return "low";
  return "unknown";
}

function roundScore(score: number): number {
  return Math.round(score * 1_000) / 1_000;
}

function unknownResponse(score: number | null): ProfessorAskResponse {
  return {
    confidence: "unknown",
    answer: UNKNOWN_ANSWER,
    matched_species: null,
    safety_warning: null,
    related: [],
    similarity_score: score === null ? null : roundScore(score),
    restricted: false,
    response_source: "unknown",
  };
}
