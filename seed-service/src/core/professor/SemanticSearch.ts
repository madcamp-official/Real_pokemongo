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
    const candidates = contextualRecords.length > 0 ? contextualRecords : this.records;
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

function detectIntendedField(question: string): KnowledgeChunk["field_type"] | null {
  const normalized = question.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const patterns: Array<[KnowledgeChunk["field_type"], RegExp]> = [
    ["size", /(크기|몸길이|키가|얼마나\s*(커|작))/u],
    ["habitat", /(어디.*(살|있)|사는\s*곳|서식|관찰\s*장소)/u],
    ["activity", /(언제\s*활동|활동\s*시간|낮에|밤에|주행성|야행성)/u],
    ["season", /(계절|몇\s*월|봄|여름|가을|겨울)/u],
    ["sound", /(소리|울음|울어|노래)/u],
    ["diet", /(먹이|무엇을\s*먹|뭘\s*먹)/u],
    ["safety", /(위험|안전|쏘|물리|만져|가까이)/u],
    ["similar", /(비슷|헷갈|닮은)/u],
    ["observation", /(관찰\s*포인트|구별|생김새)/u],
    ["funfact", /(재미|신기|특징|사실)/u],
  ];
  return patterns.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

function dot(left: readonly number[], right: readonly number[]): number {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index]! * right[index]!;
  }
  return total;
}
