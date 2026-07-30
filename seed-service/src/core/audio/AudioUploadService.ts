/**
 * 3~4단계 오케스트레이션 — `POST /audio/sightings/upload`의 실제 처리 순서를 한 곳에 모은다:
 * 멱등성 확인 → 시그니처/변환(AudioConverter) → 품질 분석(AudioQualityAnalyzer) →
 * (통과 시에만) 임시 저장(AudioTempStore) → audio_sighting 행 생성(AudioSightingRepository).
 *
 * 4단계(품질 검사와 음성 보호) 완료 후: quality는 더 이상 스텁이 아니라 실제 신호분석
 * 결과다. `usable=false`(하나 이상의 feedback_codes)면 `status: 'rejected'`가 되고,
 * 오디오 바이트는 저장하지 않는다(storagePath 없음) — `docs/audio/DECISIONS.md` "음성
 * 우세 파일은 장기 저장하지 않는다"를 speech 판정에만 국한하지 않고 모든 거부 사유에
 * 보수적으로 동일하게 적용한다(어차피 재분석 대상이 아니므로 보관할 이유가 없음).
 * sha256은 거부된 경우에도 계산한다 — 원본을 복원할 수 없는 단방향 해시라 "원본 음성이나
 * 음성 특징을 남기지 않는다"는 제약과 충돌하지 않고, 재시도 중복 감지에 여전히 쓸모 있다.
 */
import { createHash } from "node:crypto";
import { newAudioSightingId } from "../domain/ids.js";
import type { PreciseCoordinate, UserId } from "../domain/types.js";
import type { AudioSightingRepository } from "../repositories/ports.js";
import type { AudioSighting } from "./audioTypes.js";
import { AudioConverter } from "./AudioConverter.js";
import { AudioQualityAnalyzer } from "./AudioQualityAnalyzer.js";
import { AudioTempStore } from "./AudioTempStore.js";

export interface AudioUploadInput {
  userId: UserId;
  clientRecordingId: string;
  audioBytes: Buffer;
  /** 클라이언트 측 실측값 — 참고 로그용일 뿐, 저장되는 duration_ms는 항상 서버가 변환
   * 결과에서 직접 잰 값이다(doc 03 "duration_ms: 클라이언트 측정, 서버 디코드로 검증"). */
  clientDurationMs: number;
  recordedAt: string;
  /** 선택 — 있으면 확정(/audio/identify/confirm) 시 observation에 그대로 실려 지도 핀에 쓰인다. */
  coord?: PreciseCoordinate | null;
}

export interface AudioUploadServiceOptions {
  ttlHours: number;
}

export class AudioUploadService {
  private readonly analyzer = new AudioQualityAnalyzer();

  constructor(
    private readonly converter: AudioConverter,
    private readonly store: AudioTempStore,
    private readonly repo: AudioSightingRepository,
    private readonly opts: AudioUploadServiceOptions,
  ) {}

  async upload(input: AudioUploadInput): Promise<AudioSighting> {
    // 멱등성(doc 03 3단계 "client_recording_id 멱등성") — 재시도로 같은 요청이 두 번
    // 오면 재변환·재저장 없이 원래 결과를 그대로 돌려준다.
    const existing = await this.repo.findByClientRecordingId(
      input.userId,
      input.clientRecordingId,
    );
    if (existing) return existing;

    // 변환 실패(UnsupportedAudioFormatError/AudioConversionError)는 여기서 잡지 않고
    // 그대로 호출부(라우트)로 흘려보낸다 — 라우트가 doc 03/API_CONTRACT.md 에러 코드로 매핑한다.
    const converted = await this.converter.convertToMonoPcmWav(input.audioBytes);

    const sha256 = createHash("sha256").update(converted.wavBytes).digest("hex");
    const quality = this.analyzer.analyze({
      wavBytes: converted.wavBytes,
      durationMs: converted.durationMs,
    });
    // TEMP DEBUG(새소리 오탐 원인 조사 중 — 테스트 통과 전까지 지우지 말 것) --------------
    console.error("[audio quality DEBUG]", JSON.stringify(quality));
    // TEMP DEBUG 끝 ------------------------------------------------------------------

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.opts.ttlHours * 60 * 60 * 1000);

    // usable한 경우에만 실제로 저장한다 — 거부된 오디오는 storagePath 없이(바이트 미보관)
    // 판정 결과만 남긴다(이 파일 상단 주석 및 audioTypes.ts의 storagePath 설명 참고).
    const storagePath = quality.usable ? await this.store.save(converted.wavBytes) : undefined;

    const sighting: AudioSighting = {
      id: newAudioSightingId(),
      userId: input.userId,
      clientRecordingId: input.clientRecordingId,
      status: quality.usable ? "ready" : "rejected",
      mediaKind: "audio",
      mimeType: "audio/wav",
      durationMs: converted.durationMs,
      sha256,
      storagePath,
      quality,
      coord: input.coord ?? null,
      recordedAt: input.recordedAt,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await this.repo.create(sighting);
    return sighting;
  }
}
