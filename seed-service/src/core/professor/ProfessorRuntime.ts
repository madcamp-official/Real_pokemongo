import type { AppConfig } from "../../config/index.js";
import type { SpeciesContent } from "../../child/content/ContentCardService.js";
import type { Taxon } from "../domain/types.js";
import type { CollectionRepository, TaxonRepository } from "../repositories/ports.js";
import { getConfusableSciNames } from "../identification/confusionPairs.js";
import { HttpEmbeddingClient } from "./EmbeddingClient.js";
import { buildKnowledgeDocument, assertKnowledgeDocument } from "./KnowledgeIndexer.js";
import {
  loadKnowledgeVectorDocument,
  ModelMatchingEmbeddingClient,
} from "./KnowledgeVectorStore.js";
import { LocalHashEmbeddingClient } from "./LocalHashEmbeddingClient.js";
import { ProfessorService } from "./ProfessorService.js";
import { SemanticSearch, vectorizeKnowledge } from "./SemanticSearch.js";

export async function buildProfessorService(input: {
  config: AppConfig;
  taxa: readonly Taxon[];
  contents: readonly SpeciesContent[];
  taxonRepo: TaxonRepository;
  collectionRepo: CollectionRepository;
}): Promise<ProfessorService> {
  const document = buildKnowledgeDocument(
    input.taxa,
    input.contents,
    getConfusableSciNames,
  );
  assertKnowledgeDocument(
    document,
    input.taxa.map((taxon) => taxon.id as string),
  );

  let search: SemanticSearch | null = null;
  let unavailableReason: string | undefined;

  if (input.config.professor.embeddingEndpoint) {
    try {
      const index = await loadKnowledgeVectorDocument(
        input.config.professor.vectorIndexFile,
        document,
      );
      const httpClient = new HttpEmbeddingClient(
        input.config.professor.embeddingEndpoint,
        input.config.professor.embeddingTimeoutMs,
      );
      const health = await httpClient.health();
      if (
        health.model_id !== index.model_id ||
        health.model_revision !== index.model_revision ||
        health.dimension !== index.dimension
      ) {
        throw new Error("임베딩 워커 모델과 벡터 인덱스 버전이 일치하지 않습니다.");
      }
      const matchingClient = new ModelMatchingEmbeddingClient(httpClient, index);
      search = new SemanticSearch(index.records, matchingClient);
    } catch (error) {
      unavailableReason =
        error instanceof Error
          ? `도감 박사 인덱스를 준비하지 못했어요: ${error.message}`
          : "도감 박사 인덱스를 준비하지 못했어요.";
      console.error(`[professor] ${unavailableReason}`);
    }
  } else if (input.config.nodeEnv !== "production") {
    // 실서비스 모델의 대체재가 아니라 로컬 UI/정책 검증 전용이다.
    const localClient = new LocalHashEmbeddingClient();
    const vectors = await vectorizeKnowledge(document.records, localClient);
    search = new SemanticSearch(vectors, localClient);
  } else {
    unavailableReason =
      "CPU 임베딩 워커가 설정되지 않았어요. 서버 설정을 확인해 주세요.";
  }

  return new ProfessorService({
    search,
    taxa: input.taxonRepo,
    collection: input.collectionRepo,
    unavailableReason,
    thresholds: input.config.professor.thresholds,
  });
}
