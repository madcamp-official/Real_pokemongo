/**
 * 5단계(DB와 임시 세션) TTL 스윕 — doc 03 8장 "TTL: 미확정 세션은 최대 24시간; 삭제 작업
 * 재시도와 실패 모니터링; DB 행, 원본, 변환본을 함께 정리".
 *
 * "원본"은 3단계 설계상 애초에 저장되지 않으므로(AudioConverter.ts의 "원본 폐기 정책") 실제로
 * 지울 대상은 변환본(storagePath가 있으면)과 audio_sighting DB 행뿐이다.
 *
 * 재시도 전략: 파일 삭제가 실패하면(권한 등 진짜 실패 — 이미 없는 건 AudioTempStore.delete가
 * 스스로 성공 처리한다) 이번 스윕에서 그 행을 지우지 않고 건너뛴다 — 다음 스윕(주기적으로 계속
 * 돎)이 자동으로 다시 시도하는 셈이다. 파일 삭제가 성공(또는 애초에 storagePath가 없음, 즉
 * 품질 거부로 저장된 바이트가 없는 세션)해야만 DB 행을 지운다. 실패 건수는 호출부(스케줄러)가
 * 로그로 남겨 모니터링할 수 있도록 반환값에 포함한다.
 *
 * 테스트에서 `buildApp()`을 부를 때마다 백그라운드 타이머가 새로 생기는 걸 피하기 위해, 이
 * 클래스 자체는 스스로 스케줄링하지 않는다(runOnce만 제공) — 실제 주기 실행은 start()가 하고,
 * start()는 오직 serve.ts(진짜 프로세스 부팅 경로)만 호출한다. composition.ts/buildApp()은
 * 이 서비스를 만들어 붙이기만 하고 시작하지는 않는다.
 */
import type { AudioSightingRepository } from "../repositories/ports.js";
import type { AudioTempStore } from "./AudioTempStore.js";

export interface AudioSessionCleanupResult {
  /** 이번 스윕에서 실제로 지운(파일+DB 행) 세션 수. */
  deleted: number;
  /** 파일 삭제가 실패해 이번엔 건너뛴(다음 스윕에서 재시도) 세션 수. */
  fileDeleteFailures: number;
}

export interface AudioSessionCleanupOptions {
  /** 한 스윕에서 한 번에 처리할 상한(운영 안전장치 — 무제한 조회로 한 번에 과부하 방지). */
  batchLimit?: number;
  /** 실패/완료 로그 훅(기본은 console) — 테스트에서 조용히 만들 때 주입. */
  logger?: Pick<Console, "warn" | "info">;
}

const DEFAULT_BATCH_LIMIT = 500;

export class AudioSessionCleanupService {
  private timer: NodeJS.Timeout | undefined;
  private readonly batchLimit: number;
  private readonly logger: Pick<Console, "warn" | "info">;

  constructor(
    private readonly repo: AudioSightingRepository,
    private readonly store: AudioTempStore,
    opts: AudioSessionCleanupOptions = {},
  ) {
    this.batchLimit = opts.batchLimit ?? DEFAULT_BATCH_LIMIT;
    this.logger = opts.logger ?? console;
  }

  /** 한 번의 스윕. 직접 호출 가능(테스트에서 결정론적으로 검증하기 위함). */
  async runOnce(now: Date = new Date()): Promise<AudioSessionCleanupResult> {
    const expired = await this.repo.findExpired(now, this.batchLimit);
    let deleted = 0;
    let fileDeleteFailures = 0;

    for (const sighting of expired) {
      if (sighting.storagePath) {
        try {
          await this.store.delete(sighting.storagePath);
        } catch (err) {
          fileDeleteFailures++;
          this.logger.warn(
            `[audio-cleanup] 파일 삭제 실패, 다음 스윕에서 재시도: sighting=${sighting.id} err=${(err as Error).message}`,
          );
          continue; // DB 행은 그대로 둔다 — 파일이 남아있는 한 다음 스윕이 다시 시도한다.
        }
      }
      await this.repo.deleteById(sighting.id);
      deleted++;
    }

    if (deleted > 0 || fileDeleteFailures > 0) {
      this.logger.info(`[audio-cleanup] 스윕 완료: 삭제 ${deleted}건, 파일삭제실패(재시도 예정) ${fileDeleteFailures}건`);
    }
    return { deleted, fileDeleteFailures };
  }

  /** 주기 실행 시작(serve.ts 전용 — buildApp()은 절대 호출하지 않는다, 파일 상단 주석 참고). */
  start(intervalMs: number): void {
    if (this.timer) return; // 이미 시작됨(중복 start 방지)
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        this.logger.warn(`[audio-cleanup] 스윕 도중 처리되지 않은 오류: ${(err as Error).message}`);
      });
    }, intervalMs);
    // 프로세스가 이 타이머 때문에 종료를 못 하는 일이 없도록(정상 종료 경로는 stop()이 지만,
    // 방어적으로 unref — 테스트 등 짧은 실행에서도 안전).
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
