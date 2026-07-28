/**
 * 소리 기능(오디오) 도메인 타입 — `docs/audio/API_CONTRACT.md`의 quality 객체, 업로드
 * 세션(audio_sighting)과 1:1로 대응한다. 이 파일은 공통 계약(`docs/audio/`)의 코드
 * 표현일 뿐이라, 여기 필드를 늘리거나 이름을 바꾸려면 계약 자체를 먼저 바꿔야 한다
 * (CHANGE_REQUESTS.md 경유 — `03_소리기능_서버_GPU_구현계획_팀원.md` 2장 "수정 금지" 목록).
 */
import type { AudioSightingId, ObservationId, UserId } from "../domain/types.js";

/** `docs/audio/API_CONTRACT.md` "Quality object"의 blocking feedback_codes. */
export type AudioFeedbackCode =
  | "TOO_SHORT"
  | "MOSTLY_SILENCE"
  | "TOO_NOISY"
  | "CLIPPED"
  | "SPEECH_DETECTED"
  | "MULTIPLE_OVERLAP"
  | "UNSUPPORTED_SOUND"
  | "NO_TARGET_ACTIVITY";

export interface AudioQualityValidSegment {
  startMs: number;
  endMs: number;
  qualityScore: number;
}

/**
 * `docs/audio/API_CONTRACT.md`의 quality 객체(snake_case는 매퍼가 응답 직렬화 시 변환).
 *
 * 3단계(지금)는 이 객체를 스텁으로만 채운다 — durationMs만 변환된 오디오에서 실측하고,
 * 나머지(snrDb/clippingRatio/silenceRatio/speechRatio 등 실제 신호분석)는 4단계(품질
 * 검사와 음성 보호)가 진짜 값으로 채운다. 지금은 형식 검사(확장자/시그니처/크기/길이)를
 * 통과하면 무조건 usable=true, feedback_codes=[]로 둔다 — 이건 "품질이 좋다"는 뜻이
 * 아니라 "아직 품질을 안 재봤다"는 뜻이다(사용자 승인 결정, 2026-07-28).
 */
export interface AudioQuality {
  usable: boolean;
  durationMs: number;
  activeDurationMs: number;
  snrDb: number | null;
  clippingRatio: number;
  silenceRatio: number;
  speechRatio: number;
  feedbackCodes: AudioFeedbackCode[];
  validSegments: AudioQualityValidSegment[];
}

export type AudioSightingStatus = "ready" | "rejected";

/**
 * `audio_sighting` 테이블 행의 도메인 표현. PendingSighting(사진, 인메모리)과 달리
 * DB에 영속하고 24시간 TTL이 있다 — audioTypes.ts 상단 주석 및
 * `seed-service/db/migrations/0002_audio_sighting.sql` 참고.
 */
export interface AudioSighting {
  id: AudioSightingId;
  userId: UserId;
  /** 업로드 재시도 멱등키 — (userId, clientRecordingId) 유일. */
  clientRecordingId: string;
  status: AudioSightingStatus;
  mediaKind: "audio";
  /** 변환 후 실제 컨테이너(예: "audio/wav") — 클라이언트가 보낸 원본 MIME이 아니다. */
  mimeType: string;
  durationMs: number;
  /** 변환된 PCM WAV 바이트의 sha256(무결성/중복 감지용, 원본 바이트가 아님). */
  sha256: string;
  /** 내부 전용 불투명 참조(LocalDiskMediaStore.save()가 반환하는 것과 같은 성격).
   * status가 'rejected'면 저장된 바이트가 없으므로 undefined. */
  storagePath?: string;
  quality: AudioQuality;
  /** 클라이언트가 녹음한 시각(ISO8601) — DATA_CONTRACT.md의 audio_sighting.recorded_at,
   * Required 필드. 3단계 때 라우트가 파싱만 하고 저장은 안 했던 걸 5단계에서 바로잡음. */
  recordedAt: string;
  createdAt: string;
  expiresAt: string;
  /** 이 세션으로 만들어진 관찰(있으면). 한 세션 확정 1회를 보증하는 자리 — 7단계가 채운다.
   * 그 전까지는 항상 undefined. */
  confirmedObservationId?: ObservationId;
}
