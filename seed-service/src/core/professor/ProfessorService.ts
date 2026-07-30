import type { CollectionRepository, TaxonRepository } from "../repositories/ports.js";
import { SafetyFilter } from "../safety/SafetyFilter.js";
import type { Taxon, TaxonId, UserId } from "../domain/types.js";
import { topicParticleFor } from "./koreanParticles.js";
import { detectIntendedField, SemanticSearch, type SearchResult } from "./SemanticSearch.js";
import {
  DEFAULT_PROFESSOR_THRESHOLDS,
  type ProfessorAskInput,
  type ProfessorAskResponse,
  type ProfessorConfidence,
  type ProfessorGreeting,
  type ProfessorSuggestion,
  type ProfessorThresholds,
} from "./professorTypes.js";

// "먹어" 단독으로는 매칭하지 않는다 — "까치는 뭘 먹어요?"처럼 종의 먹이를 묻는 생태
// 질문에도 "먹어"가 들어있어, 예전엔 이런 질문까지 전부 "먹지 마세요" 안전 문구로
// 막혀버렸다. "먹어도 돼/되나/괜찮/안전/위험"처럼 사람이 직접 먹어도 되는지 허락을
// 구하는 표현만 안전 문구로 차단하고, 나머지(먹을 수/식용/독 등)는 원래 의도대로 유지한다.
const EDIBILITY_PATTERN =
  /(먹어도\s*(돼|되|괜찮|안전|위험)|먹을\s*수|식용|섭취|요리|삶아|구워|맛있|독버섯|독\s*없|사람이\s*먹)/u;
const SAFE_OBSERVATION_PATTERN = /(안전.*관찰|관찰.*안전|안전하게.*봐)/u;

const FIXED_EDIBILITY_ANSWER =
  "사진이나 설명만으로 먹어도 되는지 판단하면 위험해요. 어떤 생물이든 입에 넣지 말고, 가까운 어른에게 꼭 알려 주세요.";
const FIXED_OBSERVATION_ANSWER =
  "생물은 손대지 말고 눈으로 관찰해요. 벌이나 낯선 생물은 거리를 두고, 위험해 보이면 가까운 어른에게 알려 주세요.";
const UNKNOWN_ANSWER =
  "아직 그 질문에 딱 맞는 내용을 찾지 못했어요. 생김새, 사는 곳, 활동 시간처럼 한 가지를 짧게 물어봐 주세요.";

// 종 이름도 필드 패턴도 없는 질문("박사님 안녕!")은 전부 UNKNOWN_ANSWER로 뭉뚱그려져,
// 친근한 도감 박사가 인사에도 "모르겠다"고 답하는 것처럼 보였다(2026-07-30 사용자 지적).
// 이 검사는 질문 자체에 아무 근거가 없을 때(hasQuestionAnchor === false)만 참고하므로,
// "안녕하세요, 까치는 어디 살아요?"처럼 인사말 뒤에 진짜 질문이 붙으면 종 이름이 이미
// 근거가 되어 이 분기까지 오지 않고 정상적으로 검색해 답한다 — 인사말이 실제 질문을 가리지 않는다.
// 더 구체적인(정체성 > 감사 > 작별) 패턴을 먼저 확인해, "안녕히 계세요"가 "안녕"에 걸려
// 작별 인사가 아니라 일반 인사로 오분류되지 않도록 순서를 정했다.
const IDENTITY_PATTERN = /(너는\s*누구|넌\s*누구|누구세요|누구야|이름이\s*뭐|박사님은\s*누구|자기\s*소개)/u;
const THANKS_PATTERN = /(고마워|고맙습니다|고맙다|감사)/u;
const FAREWELL_PATTERN = /(잘\s*가|또\s*봐|다음에\s*봐|바이|안녕히\s*계세요|안녕히\s*가세요)/u;
const GREETING_PATTERN = /(안녕|반가워|반갑습니다|하이|헬로|\bhello\b|\bhi\b)/iu;

const SMALL_TALK_RESPONSES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    IDENTITY_PATTERN,
    "저는 이 도감의 박사예요! 우리 동네에서 만날 수 있는 곤충, 새, 식물 이야기를 들려줄게요. 궁금한 생물 이름을 말해주거나 '어디서 살아?'처럼 물어봐 주세요.",
  ],
  [THANKS_PATTERN, "천만에요! 또 궁금한 게 생기면 언제든 물어봐요."],
  [FAREWELL_PATTERN, "다음에 또 만나요! 밖에 나가면 어떤 친구를 만날지 기대돼요."],
  [GREETING_PATTERN, "안녕하세요! 궁금한 생물이 있으면 이름을 말해주거나, '어디서 살아?'처럼 물어봐 주세요."],
];

function detectSmallTalk(question: string): string | null {
  const match = SMALL_TALK_RESPONSES.find(([pattern]) => pattern.test(question));
  return match?.[1] ?? null;
}

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

    // 절대 유사도 점수는 이 임베딩 모델에서 신뢰할 수 없다 — 짧은 한국어 문장끼리는
    // 전혀 관련 없는 질문·문장 쌍도 0.7~0.87까지 나올 수 있어("오늘 저녁 뭐 먹지"가
    // "서양민들레는 주로 낮에 움직여요"와 0.869로 매칭된 사례), 점수만으로는 "진짜
    // 관련 있는 질문"과 "우연히 비슷하게 들리는 무관한 질문"을 가르지 못한다.
    // 대신 질문 자체에 최소한의 근거(종 이름이 나왔거나, 문맥 종이 주어졌거나,
    // 크기/서식지/활동시간 같은 알려진 필드 패턴에 걸리는지)가 있는지를 먼저 본다.
    // 근거가 전혀 없으면 점수가 아무리 높아도 검색조차 하지 않고 모른다고 답한다.
    const hasQuestionAnchor =
      !!namedTaxon || !!input.contextSpeciesId || detectIntendedField(question) !== null;
    if (!hasQuestionAnchor) {
      const smallTalk = detectSmallTalk(question);
      if (smallTalk) {
        return {
          confidence: "high",
          answer: smallTalk,
          matched_species: null,
          safety_warning: null,
          related: [],
          similarity_score: null,
          restricted: false,
          response_source: "small_talk",
        };
      }
      return unknownResponse(null);
    }

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
      answer: best.record.answer,
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
