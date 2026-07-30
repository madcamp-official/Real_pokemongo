import type {
  EmbeddingClient,
  KnowledgeChunk,
  KnowledgeVector,
} from "./professorTypes.js";

export interface SearchResult {
  record: KnowledgeVector;
  score: number;
}

export async function vectorizeKnowledge(
  chunks: readonly KnowledgeChunk[],
  embeddings: EmbeddingClient,
): Promise<KnowledgeVector[]> {
  const vectors: KnowledgeVector[] = [];
  for (const chunk of chunks) {
    const result = await embeddings.embed(chunk.sentence);
    vectors.push({ ...chunk, vector: result.vector });
  }
  return vectors;
}

export class SemanticSearch {
  constructor(
    private readonly records: readonly KnowledgeVector[],
    private readonly embeddings: EmbeddingClient,
  ) {}

  async search(question: string, contextSpeciesId?: string, limit = 5): Promise<SearchResult[]> {
    const query = await this.embeddings.embed(question);
    const intendedField = detectIntendedField(question);
    const contextualRecords = contextSpeciesId
      ? this.records.filter((record) => record.species_id === contextSpeciesId)
      : [];
    let candidates = contextualRecords.length > 0 ? contextualRecords : this.records;

    // 질문 유형(계절/크기/먹이 등)이 정규식으로 뚜렷하게 감지되면, 그 필드를 가진
    // 레코드만 후보로 남긴다. fieldBoost(+0.18)만으로는 원문 유사도가 훨씬 높은
    // 엉뚱한 필드가 이겨버리는 경우가 실제로 있었다 — "서양민들레는 뭘 먹어요?"가
    // diet(양분을 얻는 방법) 대신 observation(꽃잎 세어보기)과 매칭된 사례가 그렇다.
    // 해당 필드의 콘텐츠가 이 후보군에 아예 없으면(예: 이 종에 sound 문장이 없음)
    // 필터링 결과가 비어버리므로, 그때는 안전하게 원래 후보군으로 되돌아간다 —
    // "필드는 맞혔는데 그런 정보가 없어서 아예 대답을 못 하는" 사고를 막기 위함이다.
    if (intendedField) {
      const fieldFiltered = candidates.filter((record) => record.field_type === intendedField);
      if (fieldFiltered.length > 0) candidates = fieldFiltered;
    }

    // "지금 계절에는 어떤 친구를 관찰하기 좋아?"처럼 계절을 구체적으로 말하지 않은
    // season 질문은, 실제로는 아무 계절이나 걸리는 게 아니라 지금 계절(CURRENT_SEASON_WORD)
    // 이야기를 듣고 싶은 것이다. 질문이 특정 계절(봄/가을/겨울 등)을 콕 집어 말했으면
    // 그 계절을 그대로 존중하고, 아무 계절도 언급하지 않았을 때만 지금 계절로 좁힌다.
    // 이 종에 그 계절 정보가 없으면(예: 사계절 내내와 무관한 경우) 안전하게 필터 이전
    // 후보군으로 되돌아간다.
    if (intendedField === "season") {
      const targetSeasonWord = mentionedSeasonWord(question) ?? CURRENT_SEASON_WORD;
      const seasonFiltered = candidates.filter((record) => record.answer.includes(targetSeasonWord));
      if (seasonFiltered.length > 0) candidates = seasonFiltered;
    }

    const scored = candidates
      .filter((record) => record.vector.length === query.dimension)
      .map((record) => {
        const similarity = dot(query.vector, record.vector);
        const contextBoost =
          contextSpeciesId && record.species_id === contextSpeciesId ? 0.12 : 0;
        const fieldBoost = intendedField === record.field_type ? 0.18 : 0;
        return { record, score: Math.min(1, similarity + contextBoost + fieldBoost) };
      })
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, limit));
  }
}

/**
 * 질문이 어떤 지식 필드(크기/서식지/활동시간 등)를 묻는지 정규식으로 추정한다.
 * SemanticSearch 내부의 fieldBoost 계산에 쓰이고, ProfessorService의 "질문 근거"
 * 게이트(§D: 절대 점수 대신 상대적 신뢰 신호)에도 그대로 재사용한다 — 종 이름이나
 * 문맥이 없는 질문이라도 최소한 이 패턴에 걸리면 도메인 관련 질문이라고 볼 수 있다.
 */
export function detectIntendedField(question: string): KnowledgeChunk["field_type"] | null {
  const normalized = question.normalize("NFKC").toLocaleLowerCase("ko-KR");
  // 문어체("무엇을 먹", "생김새")뿐 아니라 아이가 실제로 쓰는 구어체("뭐 먹어",
  // "어떻게 생겼어")도 걸리도록 보강한 패턴이다(2026-07-30). 실기기 테스트에서
  // "까치 뭐 먹어"가 diet로 감지되지 않아 엉뚱한 관찰 포인트 문장이 나온 사례가
  // 계기였다 — 구어체 커버리지 부족이 6개 필드 전반에 있어 함께 보강했다.
  const patterns: Array<[KnowledgeChunk["field_type"], RegExp]> = [
    ["size", /(크기|몸길이|키가|얼마나\s*(커|작)|큰\s*편|작은\s*편)/u],
    ["habitat", /(어디.*(살|있)|사는\s*곳|서식|관찰\s*장소|(집|둥지).*어디|어디.*(집|둥지))/u],
    ["activity", /(언제\s*활동|활동\s*시간|낮에|밤에|주행성|야행성|언제\s*(볼|나와|움직))/u],
    ["season", /(계절|몇\s*월|봄|여름|가을|겨울)/u],
    ["sound", /(소리|울음|울어|노래)/u],
    ["safety", /(위험|안전|쏘|물리|만져|가까이)/u],
    ["similar", /(비슷|헷갈|닮은|차이|(어떻게|뭐가|무엇이)\s*(달라|다른|다르|틀려|틀린))/u],
    ["observation", /(관찰\s*포인트|구별|생김새|어떻게\s*생겼)/u],
    ["funfact", /(재미|신기|특징|사실)/u],
  ];
  const matched = patterns.find(([, pattern]) => pattern.test(normalized))?.[0];
  if (matched) return matched;
  return detectDietIntent(normalized) ? "diet" : null;
}

/** "먹이" 자체는 동물을 향한 말이라 항상 안전하다(사람은 "내 먹이"라고 말하지 않는다). */
const DIET_STRONG_PATTERN = /먹이/u;
/** "뭐/뭘 먹"류 구어체 — 종을 향한 질문("까치 뭐 먹어?")과 사람의 식사 질문("오늘
 * 저녁 뭐 먹지")이 텍스트만으론 똑같아 보인다. */
const DIET_WEAK_PATTERN = /(음식|(무엇을|뭘|뭐|뭐를|어떤\s*(걸|거|것))\s*(먹|잡아)|먹고\s*살)/u;
/** 이 단어들이 있으면 "사람이 뭘 먹을지" 얘기다 — diet(동물 먹이)로 보지 않는다. */
const HUMAN_MEAL_CONTEXT_PATTERN = /(오늘|저녁|점심|아침|간식|나는|내가)/u;

function detectDietIntent(normalizedQuestion: string): boolean {
  if (DIET_STRONG_PATTERN.test(normalizedQuestion)) return true;
  if (HUMAN_MEAL_CONTEXT_PATTERN.test(normalizedQuestion)) return false;
  return DIET_WEAK_PATTERN.test(normalizedQuestion);
}

const SEASON_WORDS = ["봄", "여름", "가을", "겨울"] as const;

/**
 * 지금 계절 — 실제 날짜 기반 계산 대신 고정값으로 둔다(제품 결정: 여름).
 * 나중에 날짜 기반으로 바꾸려면 이 한 줄만 고치면 된다.
 */
const CURRENT_SEASON_WORD: string = "여름";

/** 질문이 특정 계절 이름을 콕 집어 말했는지 확인한다(계절 문의 편향에만 쓰는 가벼운 텍스트 검사). */
function mentionedSeasonWord(question: string): string | null {
  const normalized = question.normalize("NFKC");
  return SEASON_WORDS.find((word) => normalized.includes(word)) ?? null;
}

function dot(left: readonly number[], right: readonly number[]): number {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index]! * right[index]!;
  }
  return total;
}
