/**
 * 8단계 유사도 게이트웨이 — `POST /audio/similarity/score`의 핵심 로직.
 * doc03 11장 "계산"(positiveSimilarity/confuserMargin/qualityFactor → score)을
 * `similarityScoring.ts`의 순수 함수와 조합해 실제로 수행한다.
 *
 * 사진/오디오 동정 게이트웨이와 같은 원칙: 모델 오류를 삼키지 않고 그대로 throw한다
 * (doc03 "모델 오류는 5xx로 반환") — 라우트가 503으로 매핑한다.
 */
import type { TaxonId } from "../../domain/types.js";
import type { SpeciesSoundReferenceRepository } from "../../repositories/ports.js";
import type { SpeciesSoundReference } from "../reference/referenceTypes.js";
import type { ReferenceEmbeddingStore } from "../reference/ReferenceEmbeddingStore.js";
import { getConfuserTaxonIds } from "../reference/audioConfuserGroups.js";
import type { AudioEmbeddingProvider, AudioEmbeddingSegment } from "./AudioEmbeddingProvider.js";
import { cosineSimilarity } from "./vectorMath.js";
import {
  calibrateSimilarity,
  type RecordingQualitySnapshot,
  type SimilarityGrade,
  type SimilarityReliability,
} from "./similarityScoring.js";

/** target 종 참조 클립 중 상위 몇 개까지 평균 내 positiveSimilarity를 만들지 — 6단계
 * MAX_CANDIDATES_TO_SHOW=3 재사용 관례와 같은 정신으로 3을 택함(라운드 넘버, 참조가
 * 3개 미만이면 있는 만큼만 쓴다). */
const TOP_K = 3;

export interface SimilarityScoreParams {
  wavBytes: Buffer;
  taxonId: TaxonId;
  quality: RecordingQualitySnapshot;
}

export interface SimilaritySupportedOutcome {
  supported: true;
  score: number;
  grade: SimilarityGrade;
  scoreReliability: SimilarityReliability;
  matchedSegment: { startMs: number; endMs: number };
  feedbackCodes: string[];
  modelVersion: string;
  referenceSetVersion: string;
}
export interface SimilarityUnsupportedOutcome {
  supported: false;
}
export type SimilarityOutcome = SimilaritySupportedOutcome | SimilarityUnsupportedOutcome;

interface RefMatch {
  similarity: number;
  segment: { startMs: number; endMs: number };
}

export class SimilarityGateway {
  constructor(
    private readonly embeddingProvider: AudioEmbeddingProvider,
    private readonly references: SpeciesSoundReferenceRepository,
    private readonly embeddingStore: ReferenceEmbeddingStore,
  ) {}

  async score(params: SimilarityScoreParams): Promise<SimilarityOutcome> {
    const targetRefs = await this.references.listApproved(params.taxonId);
    if (targetRefs.length === 0) {
      return { supported: false };
    }

    // 모델 호출은 참조가 있다고 확인된 뒤에만 한다 — 어차피 못 쓸 종이면 GPU 호출 자체를
    // 아낀다(비용/지연 절감, doc03 어디에도 순서를 강제하진 않지만 합리적인 선택).
    const userEmbedding = await this.embeddingProvider.embed(params.wavBytes);

    const targetMatches = await this.matchAgainstReferences(targetRefs, userEmbedding.segments);
    if (targetMatches.length === 0) {
      // 승인된 참조는 있는데 전부 embeddingRef가 비어있거나 파일을 못 읽는 경우 — 데이터
      // 정합성 문제(적재 스크립트 버그 등)이지 "참조가 없다"와는 다르다. unsupported로
      // 조용히 뭉개지 않고 그대로 던져 라우트가 503으로 알리게 한다.
      throw new Error(
        `[similarity] taxon=${params.taxonId}: approved references exist but none have a readable embedding`,
      );
    }

    const topK = [...targetMatches].sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K);
    const positiveSimilarity = topK.reduce((sum, m) => sum + m.similarity, 0) / topK.length;
    const best = topK[0]!;

    const confuserSimilarity = await this.bestConfuserSimilarity(params.taxonId, userEmbedding.segments);

    const calibrated = calibrateSimilarity({
      positiveSimilarity,
      confuserSimilarity,
      quality: params.quality,
    });

    return {
      supported: true,
      score: calibrated.score,
      grade: calibrated.grade,
      scoreReliability: calibrated.scoreReliability,
      matchedSegment: best.segment,
      // API_CONTRACT.md 어디에도 이 필드의 실제 코드값 목록이 없다 — 지어내지 않고 정직하게
      // 항상 빈 배열로 둔다(mappers.ts 파일 상단의 "간극은 빈 값으로" 관례와 동일).
      feedbackCodes: [],
      modelVersion: userEmbedding.modelVersion,
      referenceSetVersion: targetRefs[0]!.referenceSetVersion,
    };
  }

  /** 혼동종 그룹의 각 종에 대해 승인된 참조가 있으면 유저 오디오와 비교해 최고 유사도를
   * 구한다. 혼동종 참조가 하나도 없으면 null(호출부가 "페널티 없음"으로 해석). */
  private async bestConfuserSimilarity(
    taxonId: TaxonId,
    userSegments: AudioEmbeddingSegment[],
  ): Promise<number | null> {
    let best: number | null = null;
    for (const confuserTaxonId of getConfuserTaxonIds(taxonId)) {
      const confuserRefs = await this.references.listApproved(confuserTaxonId);
      const matches = await this.matchAgainstReferences(confuserRefs, userSegments);
      for (const m of matches) {
        if (best === null || m.similarity > best) best = m.similarity;
      }
    }
    return best;
  }

  /** 참조 클립마다: 유저 오디오의 모든 세그먼트와 비교해 가장 높은 유사도(+그 구간)만 남긴다
   * — BirdNetAudioProvider.aggregate()와 같은 "여러 구간 중 가장 자신 있었던 순간" 관례. */
  private async matchAgainstReferences(
    refs: SpeciesSoundReference[],
    userSegments: readonly AudioEmbeddingSegment[],
  ): Promise<RefMatch[]> {
    const results: RefMatch[] = [];
    for (const ref of refs) {
      if (!ref.embeddingRef) continue;
      const refEmbedding = await this.embeddingStore.read(ref.embeddingRef);
      if (!refEmbedding) continue;

      let best: RefMatch | null = null;
      for (const seg of userSegments) {
        const similarity = cosineSimilarity(seg.embedding, refEmbedding);
        if (!best || similarity > best.similarity) {
          best = { similarity, segment: { startMs: seg.startMs, endMs: seg.endMs } };
        }
      }
      if (best) results.push(best);
    }
    return results;
  }
}
