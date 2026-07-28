/**
 * 참조 음원 영구 저장소 (8단계). `AudioTempStore`(사용자 녹음, 24시간 TTL)와 의도적으로
 * 분리된 별도 클래스다 — 라이선스된 참조 클립은 확정/미확정과 무관하게 TTL이 없고
 * (DATA_CONTRACT.md "Reference audio has its own licensed retention policy and is not
 * deleted by user account deletion"), 이 둘을 같은 클래스로 재사용하면 참조 음원이
 * 실수로 24시간 뒤 지워지는 사고가 나기 쉽다.
 *
 * `LocalDiskMediaStore`(사진, 영구)와 저장 방식은 같지만 그 클래스를 재사용하지 않는 이유도
 * 같다 — 사진 저장소는 `SanitizedImage`(정화된 사진 바이트) 타입만 받도록 강제돼 있어
 * 오디오 바이트를 넣을 수 없다(타입 수준의 의도적 제약, MediaSanitizer.ts 참고).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const LOCAL_PREFIX = "local://";

export class ReferenceMediaStore {
  constructor(private readonly baseDir: string) {}

  async save(wavBytes: Buffer): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const filename = `${randomUUID()}.wav`;
    await writeFile(join(this.baseDir, filename), wavBytes);
    return `${LOCAL_PREFIX}${filename}`;
  }

  async read(mediaRef: string): Promise<Buffer | null> {
    if (!mediaRef.startsWith(LOCAL_PREFIX)) return null;
    const filename = mediaRef.slice(LOCAL_PREFIX.length);
    try {
      return await readFile(join(this.baseDir, filename));
    } catch {
      return null;
    }
  }
}
