/**
 * 참조 클립의 사전 계산된 임베딩(species_sound_reference.embedding_ref가 가리키는 실제
 * 벡터) 저장소. media_ref/storage_path와 같은 "불투명 참조" 관례를 그대로 따른다 —
 * DB엔 포인터만 두고 실제 float 배열은 파일로 둔다(JSONB로 DB에 직접 넣지 않는 이유:
 * 이 값은 SQL로 쿼리/필터링할 대상이 아니라 그대로 CAMP-3 요청에 실어 보낼 뿐이라,
 * quality_json/candidates_json과 달리 DB 컬럼일 필요가 없다).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export class ReferenceEmbeddingStore {
  constructor(private readonly baseDir: string) {}

  async save(embedding: number[]): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const filename = `${randomUUID()}.json`;
    await writeFile(join(this.baseDir, filename), JSON.stringify(embedding));
    return filename;
  }

  async read(embeddingRef: string): Promise<number[] | null> {
    try {
      const raw = await readFile(join(this.baseDir, embeddingRef), "utf8");
      return JSON.parse(raw) as number[];
    } catch {
      return null;
    }
  }
}
