/**
 * 소리 기능(오디오) 도메인 타입 — `docs/audio/API_CONTRACT.md`의 quality 객체, 업로드
 * 세션(audio_sighting)과 1:1로 대응한다. 이 파일은 공통 계약(`docs/audio/`)의 코드
 * 표현일 뿐이라, 여기 필드를 늘리거나 이름을 바꾸려면 계약 자체를 먼저 바꿔야 한다
 * (CHANGE_REQUESTS.md 경유 — `03_소리기능_서버_GPU_구현계획_팀원.md` 2장 "수정 금지" 목록).
 */
import type { AudioSightingId, ObservationId, PreciseCoordinate, TaxonId, UserId } from "../domain/types.js";

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
  /** CR-20260729-noisy-audio-reaches-model: TOO_NOISY/SPEECH_DETECTED/MULTIPLE_OVERLAP 조건 중
   * 하나라도 해당하면 true. usable을 더 이상 막지 않는 대신, AudioIdentificationGateway가 이
   * 플래그를 보고 고확신 후보만 인정하는 안전장치를 켠다. 계약 필드가 아니라 HTTP 응답에는
   * 절대 노출하지 않는다(내부 신호 전용). */
  noisy: boolean;
  durationMs: number;
  activeDurationMs: number;
  snrDb: number | null;
  clippingRatio: number;
  silenceRatio: number;
  speechRatio: number;
  feedbackCodes: AudioFeedbackCode[];
  validSegments: AudioQualityValidSegment[];
}

export type AudioSightingStatus = "ready" | "rejected" | "confirmed";

/** `POST /audio/identify/confirm` 성공 응답의 도메인 표현 — `reward`는 D단계 보상 체계(관찰
 * 기본 XP + 완료된 퀘스트 id)의 스냅샷. 확정 시점에만 참인 값(dexUpdated/xp)이라 재생(멱등
 * 재요청) 응답을 나중에 다시 계산하면 안 된다 — 그대로 저장해서 그대로 돌려준다. */
export interface AudioConfirmReward {
  xp: number;
  questIds: string[];
}
export interface AudioConfirmResult {
  observationId: ObservationId;
  speciesId: TaxonId;
  dexUpdated: boolean;
  reward: AudioConfirmReward;
}

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
  /** 사용자가 제공한 정밀 좌표(선택) — 사진 파이프라인의 rawCoord와 같은 성격.
   * `db/migrations/0006_audio_sighting_coord.sql`. 3단계 때는 파싱만 하고 버렸었는데,
   * 그 탓에 /audio/identify/confirm이 만드는 observation에 좌표가 전혀 안 남아 소리로
   * 등록한 종이 탐험 지도(/map/pins)에 안 뜨는 문제가 있었다(2026-07-29 수정). */
  coord?: PreciseCoordinate | null;
  /** 클라이언트가 녹음한 시각(ISO8601) — DATA_CONTRACT.md의 audio_sighting.recorded_at,
   * Required 필드. 3단계 때 라우트가 파싱만 하고 저장은 안 했던 걸 5단계에서 바로잡음. */
  recordedAt: string;
  createdAt: string;
  expiresAt: string;
  /** 이 세션으로 만들어진 관찰(있으면). 한 세션 확정 1회를 보증하는 자리 — 7단계가 채운다.
   * 그 전까지는 항상 undefined. */
  confirmedObservationId?: ObservationId;
  /** 확정을 "클레임"한 confirmation_id(원자적 compare-and-swap 마커). 이게 설정돼 있으면
   * status와 무관하게 확정 진행 중/완료 상태 — 같은 값이면 재생, 다른 값이면 409. */
  confirmationId?: string;
  /** confirmationId가 설정된 뒤 실제로 관찰이 만들어지면 채워지는 응답 스냅샷. 클레임 직후~
   * 완료 사이(정상적으론 매우 짧음)엔 confirmationId만 있고 이건 아직 undefined일 수 있다. */
  confirmResult?: AudioConfirmResult;
}
