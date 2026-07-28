/**
 * 8단계 점수 교정기 — doc03 11장의 "계산" 항목(positiveSimilarity/confuserMargin/
 * qualityFactor → score)을 실제 코드로 구현한다. 순수 함수, GPU/DB 불필요(유닛 테스트로
 * 실데이터 없이도 전부 검증 가능).
 *
 * doc03과 의도적으로 다른 점 하나: doc03 서술은 qualityFactor를 score 계산 안에 섞어 넣는
 * 것처럼 읽히지만, 실제 공유 계약 fixture(`docs/audio/fixtures/similarity-success.json`)엔
 * doc03에 없는 `score_reliability` 필드가 별도로 존재한다. 그래서 여기선 둘을 분리했다:
 *   - score: 순수하게 "얼마나 비슷하게 들렸는가"(음향적 유사도 + 혼동종 대비)만 반영.
 *   - score_reliability: "이 점수를 얼마나 믿어도 되는가"(녹음 자체의 품질, Stage 4가 이미
 *     실측한 snr_db/active_duration_ms 재사용)를 별도로 알려준다.
 * 품질까지 score에 곱해버리면 "새소리를 잘 흉내냈는데 녹음이 지저분해서" 점수가 낮게
 * 나올 수 있어, 아이 입장에서 "내 흉내가 틀렸나?"로 오인하기 쉽다 — 원인을 분리해서
 * 보여주는 게 더 정직하다고 판단했다(doc03이 이 필드를 언급하지 않아 정확한 원래 의도를
 * 재구성할 수 없으므로, 계약 fixture와 어긋나지 않는 선에서 합리적으로 설계한 것).
 */
import { clamp01 } from "./vectorMath.js";

export type SimilarityGrade = "low_similarity" | "somewhat_similar" | "very_similar" | "strong_match";
export type SimilarityReliability = "low" | "medium" | "high";

export interface RecordingQualitySnapshot {
  snrDb: number | null;
  activeDurationMs: number;
  durationMs: number;
}

export interface CalibrateSimilarityInput {
  /** target 종 참조 클립들의 top-K 유사도 평균(-1..1, 보통 0..1). */
  positiveSimilarity: number;
  /** 혼동종 참조 클립들 중 최고 유사도. 혼동종 참조가 아예 없으면 null(페널티 없음). */
  confuserSimilarity: number | null;
  quality: RecordingQualitySnapshot;
}

export interface CalibratedSimilarity {
  score: number; // 0..100 정수
  grade: SimilarityGrade;
  scoreReliability: SimilarityReliability;
}

// 등급 경계 — API_CONTRACT.md에 정확한 수치가 없어 fixture 예시(score=78 → very_similar)가
// 이 경계 안에 자연스럽게 들어가도록 라운드 넘버로 정했다(confidencePolicy.ts의 관례와 동일).
const GRADE_THRESHOLDS = { strongMatch: 85, verySimilar: 65, somewhatSimilar: 40 };
const RELIABILITY_THRESHOLDS = { high: 0.7, medium: 0.4 };
// 혼동종이 target보다 더 비슷하게 들리면 최대 이만큼(퍼센트 포인트) 점수를 깎는다.
// margin이 양수(target이 더 비슷)일 땐 보너스를 주지 않는다 — positiveSimilarity 자체가
// 이미 "얼마나 비슷한가"의 본원적 척도라, 혼동종은 오직 "감점 사유"로만 쓴다.
const CONFUSER_PENALTY_WEIGHT = 40;

export function calibrateSimilarity(input: CalibrateSimilarityInput): CalibratedSimilarity {
  const base = clamp01(input.positiveSimilarity);
  const confuserMargin =
    input.confuserSimilarity === null ? 0 : input.positiveSimilarity - input.confuserSimilarity;
  const penalty = confuserMargin < 0 ? clamp01(-confuserMargin) * (CONFUSER_PENALTY_WEIGHT / 100) : 0;
  const adjusted = clamp01(base - penalty);
  const score = Math.round(adjusted * 100);

  const grade: SimilarityGrade =
    score >= GRADE_THRESHOLDS.strongMatch
      ? "strong_match"
      : score >= GRADE_THRESHOLDS.verySimilar
        ? "very_similar"
        : score >= GRADE_THRESHOLDS.somewhatSimilar
          ? "somewhat_similar"
          : "low_similarity";

  const qualityFactor = computeQualityFactor(input.quality);
  const scoreReliability: SimilarityReliability =
    qualityFactor >= RELIABILITY_THRESHOLDS.high
      ? "high"
      : qualityFactor >= RELIABILITY_THRESHOLDS.medium
        ? "medium"
        : "low";

  return { score, grade, scoreReliability };
}

/** Stage 4가 이미 실측해 저장해둔 snr_db/active_duration_ms를 재사용한다 — 새 신호를
 * 지어내지 않는다("측정하지 않고 넘어가지 않기" 원칙). snr_db가 없으면(이론상 항상 있지만
 * 방어적으로) 중립값 0.5로 취급한다. */
function computeQualityFactor(q: RecordingQualitySnapshot): number {
  const snrFactor = q.snrDb === null ? 0.5 : clamp01(q.snrDb / 20); // 20dB 이상이면 만점 취급
  const activeFactor = q.durationMs > 0 ? clamp01(q.activeDurationMs / q.durationMs) : 0;
  return 0.5 * snrFactor + 0.5 * activeFactor;
}
