import type { TaxonId, UserId } from "../domain/types.js";

export type ProfessorFieldType =
  | "habitat"
  | "diet"
  | "activity"
  | "sound"
  | "size"
  | "season"
  | "safety"
  | "funfact"
  | "observation"
  | "similar";

export interface KnowledgeChunk {
  chunk_id: string;
  sentence: string;
  species_id: string;
  species_name: string;
  field_type: ProfessorFieldType;
  is_safety: boolean;
  content_version: string;
}

export interface KnowledgeVector extends KnowledgeChunk {
  vector: number[];
}

export interface KnowledgeDocument {
  schema_version: "professor-knowledge-v1";
  content_version: string;
  content_hash: string;
  records: KnowledgeChunk[];
}

export interface KnowledgeVectorDocument {
  schema_version: "professor-knowledge-v1";
  model_id: string;
  model_revision: string;
  dimension: number;
  normalized: true;
  content_hash: string;
  records: KnowledgeVector[];
}

export type ProfessorConfidence = "high" | "medium" | "low" | "unknown";

export interface ProfessorMatchedSpecies {
  species_id: string;
  name: string;
  discovered: boolean;
}

export interface ProfessorRelatedSpecies {
  species_id: string;
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
  response_source: "indexed_sentence" | "fixed_safety" | "unknown";
}

export interface ProfessorSuggestion {
  id: string;
  question: string;
  context_species_id?: string;
}

export interface ProfessorGreeting {
  message: string;
  discovered_count: number;
}

export interface ProfessorAskInput {
  userId: UserId;
  question: string;
  contextSpeciesId?: TaxonId;
}

export interface EmbeddingResult {
  model_id: string;
  model_revision: string;
  dimension: number;
  normalized: boolean;
  vector: number[];
}

export interface EmbeddingClient {
  embed(text: string): Promise<EmbeddingResult>;
}

export interface ProfessorThresholds {
  high: number;
  medium: number;
  low: number;
}

export const DEFAULT_PROFESSOR_THRESHOLDS: ProfessorThresholds = {
  high: 0.7,
  medium: 0.5,
  low: 0.35,
};

