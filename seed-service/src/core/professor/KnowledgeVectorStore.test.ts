import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadKnowledgeVectorDocument } from "./KnowledgeVectorStore.js";
import type { KnowledgeChunk, KnowledgeDocument, KnowledgeVectorDocument } from "./professorTypes.js";

function makeChunk(overrides: Partial<KnowledgeChunk> = {}): KnowledgeChunk {
  return {
    chunk_id: "taxon-test:habitat:1",
    sentence: "테스트종 관찰 장소: 공원",
    answer: "테스트종은 주로 공원에서 지내요.",
    species_id: "taxon-test",
    species_name: "테스트종",
    field_type: "habitat",
    is_safety: false,
    content_version: "seed-content-v1",
    ...overrides,
  };
}

function makeDocument(chunks: KnowledgeChunk[]): KnowledgeDocument {
  return {
    schema_version: "professor-knowledge-v1",
    content_version: "seed-content-v1",
    content_hash: "test-hash",
    records: chunks,
  };
}

async function writeVectorFile(dir: string, doc: KnowledgeVectorDocument): Promise<string> {
  const path = join(dir, `vectors-${randomUUID()}.json`);
  await writeFile(path, JSON.stringify(doc), "utf8");
  return path;
}

test("loadKnowledgeVectorDocument: sentence/answer가 모두 일치하면 정상 로드된다", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "vector-store-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const chunk = makeChunk();
  const knowledge = makeDocument([chunk]);
  const vectorDoc: KnowledgeVectorDocument = {
    schema_version: "professor-knowledge-v1",
    model_id: "test-model",
    model_revision: "rev1",
    dimension: 2,
    normalized: true,
    content_hash: knowledge.content_hash,
    records: [{ ...chunk, vector: [0.1, 0.2] }],
  };
  const path = await writeVectorFile(dir, vectorDoc);

  const loaded = await loadKnowledgeVectorDocument(path, knowledge);
  assert.equal(loaded.records[0]!.answer, chunk.answer);
});

test("loadKnowledgeVectorDocument: answer만 최신 콘텐츠와 다르면(sentence는 같아도) 조용히 넘어가지 않고 던진다", async (t) => {
  // 이 테스트는 KnowledgeIndexer의 answer 템플릿을 바꿨는데 벡터 인덱스 파일
  // (data/professor-knowledge-vectors.json)을 재생성하지 않고 배포하면, 서버가
  // 부팅은 되지만 오래된(또는 undefined) answer를 조용히 내려주는 사고를 막기 위한
  // 회귀 방지 테스트다 — 반드시 명시적 에러로 실패해야 한다.
  const dir = await mkdtemp(join(tmpdir(), "vector-store-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const currentChunk = makeChunk({ answer: "테스트종은 주로 공원에서 지내요. (최신)" });
  const knowledge = makeDocument([currentChunk]);
  const staleChunk = makeChunk({ answer: "테스트종 관찰 장소: 공원" }); // 옛 라벨식 answer
  const vectorDoc: KnowledgeVectorDocument = {
    schema_version: "professor-knowledge-v1",
    model_id: "test-model",
    model_revision: "rev1",
    dimension: 2,
    normalized: true,
    content_hash: knowledge.content_hash,
    records: [{ ...staleChunk, vector: [0.1, 0.2] }],
  };
  const path = await writeVectorFile(dir, vectorDoc);

  await assert.rejects(
    () => loadKnowledgeVectorDocument(path, knowledge),
    /벡터 레코드가 현재 콘텐츠와 다릅니다/,
  );
});
