/**
 * 6단계(소리 동정 API) 도메인 타입 — `docs/audio/API_CONTRACT.md` §2 "Identify a prepared
 * sighting"과 1:1 대응한다. 사진 파이프라인(`IdentificationOutcome`)과 의도적으로 다른 모양
 * 이다:
 *  - 사진은 confidence 하나로 "전체 결과"의 tier를 정해 high만 자동확정/medium만 후보노출
 *    하지만, 오디오 계약은 **후보마다 개별 confidence_level**을 매기고 low까지 그대로
 *    노출한다(fixtures/identify-multiple-candidates.json — medium+low 후보가 함께 나옴).
 *    오디오는 confirm 전엔 절대 자동확정하지 않는다(doc03 6단계 "관찰·도감·퀘스트·보상 변경
 *    금지").
 *  - `confidenceLevel`은 사진과 같은 `core/identification/confidencePolicy.ts`의
 *    `classifyConfidence()`/`DEFAULT_THRESHOLDS`를 그대로 재사용한다 — 계약의 fixture 예시
 *    값(0.87→high, 0.62→medium, 0.41→low)이 그 임계값(0.85/0.60/0.35)과 정확히 맞아떨어져
 *    새로 만들 이유가 없었다(추측 아니라 확인된 재사용).
 */
import type { AudioSightingId, TaxonId } from "../../domain/types.js";
import type { ConfidenceTier } from "../../identification/confidencePolicy.js";

/** `classifyConfidence()`가 낼 수 있는 4값 중 "unknown"은 여기서 걸러진다(low 미만은 후보에서
 * 아예 빠짐) — 그래서 API 계약의 confidence_level은 항상 이 3값 중 하나다. */
export type AudioConfidenceLevel = Exclude<ConfidenceTier, "unknown">;

export interface AudioIdentificationCandidate {
  speciesId: TaxonId;
  commonNameKo: string;
  scientificName: string;
  confidence: number;
  confidenceLevel: AudioConfidenceLevel;
  /** 모델이 이 종을 검출한 구간(원본 오디오 기준 ms) — 여러 세그먼트 중 가장 점수가 높았던 구간. */
  startMs: number;
  endMs: number;
  isDangerous: boolean;
}

export type AudioUnknownReason = "NO_SUPPORTED_BIRD_MATCH";

/** `AudioIdentificationGateway.identify()`의 결과 — 그대로 응답 매퍼에 들어간다. */
export interface AudioIdentificationOutcome {
  candidates: AudioIdentificationCandidate[];
  unknown: boolean;
  unknownReason?: AudioUnknownReason;
  needsUserConfirmation: boolean;
  modelVersion: string;
  locationPriorUsed: boolean;
}

/**
 * `audio_identification_result` 테이블(5단계가 스키마만 만들어둠) 행의 도메인 표현 —
 * `/audio/identify`가 반환한 결과의 스냅샷. `/audio/identify/confirm`(7단계)이 사용자가
 * 고른 species_id가 실제로 이 스냅샷에 있었는지 검증하는 데 쓴다(위조 방지).
 * PK가 audioSightingId 하나뿐이라 재동정(re-identify)은 덮어쓰기(upsert)다 — STATE_MACHINE.md
 * "identified -> Identify again"이 이력이 아니라 최신 스냅샷 1건이라는 뜻과 일치.
 */
export interface AudioIdentificationResult {
  audioSightingId: AudioSightingId;
  candidates: AudioIdentificationCandidate[];
  unknown: boolean;
  unknownReason?: AudioUnknownReason;
  modelProvider: string;
  modelVersion: string;
  locationPriorUsed: boolean;
  createdAt: string;
}
