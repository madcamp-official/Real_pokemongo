import { createHash } from "node:crypto";
import type { SpeciesContent } from "../../child/content/ContentCardService.js";
import type { Taxon } from "../domain/types.js";
import { SafetyFilter } from "../safety/SafetyFilter.js";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  ProfessorFieldType,
} from "./professorTypes.js";

const CONTENT_VERSION = "seed-content-v1";

const HABITAT_KO: Record<string, string> = {
  neighborhood: "우리 동네",
  park: "공원",
  mountain: "산",
  waterside: "물가",
  garden: "화단과 정원",
  field: "들판",
};

const SEASON_KO: Record<string, string> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
  all_year: "사계절",
};

const ACTIVE_TIME_KO: Record<string, string> = {
  day: "낮",
  night: "밤",
  both: "낮과 밤",
};

function normalizeSentence(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return /[.!?。！？]$/.test(normalized) ? normalized : `${normalized}.`;
}

function contentHash(records: KnowledgeChunk[]): string {
  const canonical = records
    .map(({ chunk_id, sentence, species_id, field_type, is_safety, content_version }) => ({
      chunk_id,
      sentence,
      species_id,
      field_type,
      is_safety,
      content_version,
    }))
    .sort((a, b) => a.chunk_id.localeCompare(b.chunk_id));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

interface ChunkDraft {
  fieldType: ProfessorFieldType;
  sentence: string;
  isSafety?: boolean;
}

function draftsForTaxon(
  taxon: Taxon,
  content: SpeciesContent | null,
  taxaByScientificName: ReadonlyMap<string, Taxon>,
  confusableScientificNames: (scientificName: string) => readonly string[],
): ChunkDraft[] {
  const name = taxon.korName || taxon.sciName;
  const drafts: ChunkDraft[] = [];

  if (taxon.habitatTags.length > 0) {
    const habitats = taxon.habitatTags.map((tag) => HABITAT_KO[tag] ?? tag).join(", ");
    drafts.push({ fieldType: "habitat", sentence: `${name} 관찰 장소: ${habitats}` });
  }
  if (taxon.activeTime) {
    drafts.push({
      fieldType: "activity",
      sentence: `${name} 활동 시간: 주로 ${ACTIVE_TIME_KO[taxon.activeTime]}`,
    });
  }
  if (taxon.sizeDescription) {
    drafts.push({ fieldType: "size", sentence: `${name} 크기: ${taxon.sizeDescription}` });
  }
  if (taxon.seasonTags.length > 0) {
    const seasons = taxon.seasonTags.map((tag) => SEASON_KO[tag] ?? tag).join(", ");
    drafts.push({ fieldType: "season", sentence: `${name} 관찰 계절: ${seasons}` });
  }

  if (content?.funFact) {
    drafts.push({ fieldType: "funfact", sentence: content.funFact });
  }
  for (const point of content?.observePoints ?? []) {
    drafts.push({ fieldType: "observation", sentence: `${name} 관찰 포인트: ${point}` });
  }
  for (const fact of content?.knowledgeFacts ?? []) {
    drafts.push({ fieldType: fact.fieldType, sentence: fact.sentence });
  }

  const safety = new SafetyFilter().evaluate(taxon);
  if (safety) {
    drafts.push({
      fieldType: "safety",
      sentence: `${name}: ${safety.message}`,
      isSafety: true,
    });
  }

  const similarNames = confusableScientificNames(taxon.sciName)
    .map((sciName) => taxaByScientificName.get(sciName))
    .filter((candidate): candidate is Taxon => candidate !== undefined)
    .map((candidate) => candidate.korName || candidate.sciName);
  if (similarNames.length > 0) {
    drafts.push({
      fieldType: "similar",
      sentence: `${name}와 헷갈리기 쉬운 생물: ${similarNames.join(", ")}`,
    });
  }

  return drafts;
}

export function buildKnowledgeDocument(
  taxa: readonly Taxon[],
  contents: readonly SpeciesContent[],
  confusableScientificNames: (scientificName: string) => readonly string[] = () => [],
): KnowledgeDocument {
  const contentByTaxonId = new Map(contents.map((content) => [content.taxonId as string, content]));
  const taxaByScientificName = new Map(taxa.map((taxon) => [taxon.sciName, taxon]));
  const records: KnowledgeChunk[] = [];

  for (const taxon of taxa) {
    const indexByField = new Map<ProfessorFieldType, number>();
    const drafts = draftsForTaxon(
      taxon,
      contentByTaxonId.get(taxon.id as string) ?? null,
      taxaByScientificName,
      confusableScientificNames,
    );

    for (const draft of drafts) {
      const sentence = normalizeSentence(draft.sentence);
      if (!sentence) continue;
      const index = (indexByField.get(draft.fieldType) ?? 0) + 1;
      indexByField.set(draft.fieldType, index);
      records.push({
        chunk_id: `${taxon.id}:${draft.fieldType}:${index}`,
        sentence,
        species_id: taxon.id as string,
        species_name: taxon.korName || taxon.sciName,
        field_type: draft.fieldType,
        is_safety: draft.isSafety ?? false,
        content_version: CONTENT_VERSION,
      });
    }
  }

  return {
    schema_version: "professor-knowledge-v1",
    content_version: CONTENT_VERSION,
    content_hash: contentHash(records),
    records,
  };
}

export function assertKnowledgeDocument(
  document: KnowledgeDocument,
  expectedSpeciesIds: readonly string[],
): void {
  const ids = new Set<string>();
  const countBySpecies = new Map<string, number>();

  for (const record of document.records) {
    if (!record.sentence.trim()) throw new Error(`빈 지식 문장: ${record.chunk_id}`);
    if (ids.has(record.chunk_id)) throw new Error(`중복 chunk_id: ${record.chunk_id}`);
    ids.add(record.chunk_id);
    countBySpecies.set(record.species_id, (countBySpecies.get(record.species_id) ?? 0) + 1);
  }

  for (const speciesId of expectedSpeciesIds) {
    const count = countBySpecies.get(speciesId) ?? 0;
    if (count < 4) {
      throw new Error(`${speciesId}의 지식 문장이 ${count}개뿐입니다(최소 4개 필요).`);
    }
  }
}
