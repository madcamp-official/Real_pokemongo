import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HttpEmbeddingClient } from "./EmbeddingClient.js";
import type { KnowledgeDocument, KnowledgeVector, KnowledgeVectorDocument } from "./professorTypes.js";

/**
 * professor:index(Python, embedding-worker/build_index.py)의 대안 경로.
 *
 * Python 스크립트는 sentence-transformers 모델을 이 컴퓨터에서 직접 로드하기 때문에
 * 무거운 로컬 ML 스택(torch 등)이 있어야만 동작한다. 하지만 도감 박사 임베딩 워커는
 * 이미 공유 GPU 서버에 systemd 서비스로 상시 구동 중이고, 팀원들은 SSH 터널로만
 * 접근하는 구조로 옮겨졌다(.env.example 참고) — 즉 로컬에 모델을 다시 설치할 필요가
 * 없다. 이 스크립트는 이미 검증된 HttpEmbeddingClient로 같은 워커에 문장을 하나씩
 * 보내 벡터를 받아, Python 스크립트와 동일한 스키마의 professor-knowledge-vectors.json을
 * 만든다. PROFESSOR_EMBEDDING_ENDPOINT가 설정돼 있어야 한다(SSH 터널 필요).
 */

const sourceDir = dirname(fileURLToPath(import.meta.url));
const knowledgePath = resolve(sourceDir, "../../../data/professor-knowledge.json");
const outputPath = resolve(sourceDir, "../../../data/professor-knowledge-vectors.json");

const endpoint = process.env.PROFESSOR_EMBEDDING_ENDPOINT;
if (!endpoint) {
  throw new Error(
    "PROFESSOR_EMBEDDING_ENDPOINT가 설정되지 않았습니다. SSH 터널을 연 뒤 .env에 채워 주세요.",
  );
}
const timeoutMs = Number(process.env.PROFESSOR_EMBEDDING_TIMEOUT_MS ?? "1500");

const raw = await readFile(knowledgePath, "utf8");
const knowledge = JSON.parse(raw) as KnowledgeDocument;
if (knowledge.schema_version !== "professor-knowledge-v1" || knowledge.records.length === 0) {
  throw new Error("지원하지 않거나 비어 있는 지식 문서입니다. professor:knowledge를 먼저 실행하세요.");
}

const client = new HttpEmbeddingClient(endpoint, timeoutMs);
const meta = await client.health();
console.log(`임베딩 워커: ${meta.model_id}@${meta.model_revision} (dim=${meta.dimension})`);

const vectorRecords: KnowledgeVector[] = [];
for (let i = 0; i < knowledge.records.length; i += 1) {
  const record = knowledge.records[i]!;
  const result = await client.embed(record.sentence);
  if (
    result.model_id !== meta.model_id ||
    result.model_revision !== meta.model_revision ||
    result.dimension !== meta.dimension
  ) {
    throw new Error(`임베딩 워커가 요청 도중 모델을 바꿨습니다: ${record.chunk_id}`);
  }
  vectorRecords.push({ ...record, vector: result.vector });
  if ((i + 1) % 100 === 0 || i === knowledge.records.length - 1) {
    console.log(`  ${i + 1}/${knowledge.records.length} 문장 임베딩 완료`);
  }
}

const output: KnowledgeVectorDocument = {
  schema_version: "professor-knowledge-v1",
  model_id: meta.model_id,
  model_revision: meta.model_revision,
  dimension: meta.dimension,
  normalized: true,
  content_hash: knowledge.content_hash,
  records: vectorRecords,
};

await writeFile(outputPath, `${JSON.stringify(output)}\n`, "utf8");
console.log(`${vectorRecords.length}개 문장의 벡터 인덱스를 저장했습니다: ${outputPath}`);
