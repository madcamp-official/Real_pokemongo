import { readFile } from "node:fs/promises";
import type {
  EmbeddingClient,
  EmbeddingResult,
  KnowledgeDocument,
  KnowledgeVectorDocument,
} from "./professorTypes.js";
import { EmbeddingUnavailableError } from "./EmbeddingClient.js";

export async function loadKnowledgeVectorDocument(
  filePath: string,
  expectedKnowledge: KnowledgeDocument,
): Promise<KnowledgeVectorDocument> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<KnowledgeVectorDocument>;
  if (
    parsed.schema_version !== "professor-knowledge-v1" ||
    typeof parsed.model_id !== "string" ||
    typeof parsed.model_revision !== "string" ||
    typeof parsed.dimension !== "number" ||
    parsed.normalized !== true ||
    parsed.content_hash !== expectedKnowledge.content_hash ||
    !Array.isArray(parsed.records)
  ) {
    throw new Error("도감 박사 벡터 인덱스 메타데이터가 현재 콘텐츠와 맞지 않습니다.");
  }
  if (parsed.records.length !== expectedKnowledge.records.length) {
    throw new Error("도감 박사 벡터 인덱스의 문장 수가 현재 콘텐츠와 다릅니다.");
  }
  const expectedById = new Map(
    expectedKnowledge.records.map((record) => [record.chunk_id, record]),
  );
  const seen = new Set<string>();
  for (const record of parsed.records) {
    const expected = expectedById.get(record.chunk_id);
    if (
      !expected ||
      seen.has(record.chunk_id) ||
      record.sentence !== expected.sentence ||
      record.species_id !== expected.species_id ||
      record.field_type !== expected.field_type ||
      record.is_safety !== expected.is_safety ||
      record.content_version !== expected.content_version
    ) {
      throw new Error(`도감 박사 벡터 레코드가 현재 콘텐츠와 다릅니다: ${record.chunk_id}`);
    }
    seen.add(record.chunk_id);
    if (
      !Array.isArray(record.vector) ||
      record.vector.length !== parsed.dimension ||
      record.vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error(`도감 박사 벡터가 손상되었습니다: ${record.chunk_id}`);
    }
  }
  return parsed as KnowledgeVectorDocument;
}

/** 인덱스와 런타임 워커가 같은 모델인지 첫 요청부터 강제한다. */
export class ModelMatchingEmbeddingClient implements EmbeddingClient {
  constructor(
    private readonly delegate: EmbeddingClient,
    private readonly expected: Pick<
      KnowledgeVectorDocument,
      "model_id" | "model_revision" | "dimension"
    >,
  ) {}

  async embed(text: string): Promise<EmbeddingResult> {
    const result = await this.delegate.embed(text);
    if (
      result.model_id !== this.expected.model_id ||
      result.model_revision !== this.expected.model_revision ||
      result.dimension !== this.expected.dimension
    ) {
      throw new EmbeddingUnavailableError(
        "도감 박사 임베딩 모델과 지식 인덱스 버전이 일치하지 않습니다.",
      );
    }
    return result;
  }
}
