/**
 * 오디오 임시 저장소 (3단계). `LocalDiskMediaStore`(사진, 영구 보관)와 의도적으로 분리된
 * 별도 클래스다 — 사용자 녹음(원본이든 변환본이든)은 확정 여부와 무관하게 24시간 뒤
 * 삭제해야 한다(`docs/audio/DECISIONS.md`: "User-recorded raw and converted audio expire
 * within 24 hours even when the observation is confirmed"). 영구 저장소 클래스를 재사용하면
 * 이 만료 정책을 나중에 빼먹기 쉬우므로, 애초에 "임시"라는 성격이 타입 이름에 드러나게 했다.
 *
 * 실제 TTL 정리(만료된 파일을 도는 스윕 작업)는 이 클래스의 책임이 아니다 — 5단계가
 * `audio_sighting.expires_at` 인덱스를 기준으로 도는 정리 작업을 만들 때 이 스토어의
 * delete()를 호출하게 된다(지금은 그 스윕 자체가 아직 없음, 3단계 범위 밖).
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export class AudioTempStore {
  constructor(private readonly baseDir: string) {}

  /** 변환된 mono PCM WAV 바이트를 저장하고, 내부 전용 불투명 참조(파일명)를 반환한다. */
  async save(wavBytes: Buffer): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const filename = `${randomUUID()}.wav`;
    await writeFile(join(this.baseDir, filename), wavBytes);
    return filename;
  }

  async read(storagePath: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.baseDir, storagePath));
    } catch {
      return null;
    }
  }

  /**
   * 5단계(AudioSessionCleanupService)의 TTL 스윕이 실제 첫 호출부다 — "삭제 작업 재시도"가
   * 의미를 가지려면 진짜 실패(권한 등)와 "이미 없음"을 구분해야 한다. 이미 없으면 목표(파일이
   * 없다)가 이미 달성된 것이므로 조용히 성공 처리하고, 그 외 에러는 호출부가 알 수 있게
   * 그대로 던진다(호출부가 이번 스윕에서 DB 행 삭제를 보류하고 다음 스윕에서 재시도한다).
   */
  async delete(storagePath: string): Promise<void> {
    try {
      await unlink(join(this.baseDir, storagePath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}
