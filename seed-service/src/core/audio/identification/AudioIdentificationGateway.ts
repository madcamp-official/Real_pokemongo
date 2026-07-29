/**
 * 6단계(소리 동정 API) — `AudioIdentificationProvider`가 낸 원시 후보를 taxon에 매핑하고,
 * 계약이 요구하는 형태(`AudioIdentificationOutcome`)로 판정한다. `core/identification/
 * IdentificationGateway.ts`(사진)와 의도적으로 다른 부분(전부 audioIdentificationTypes.ts
 * 상단 주석과 doc03 9장 근거):
 *
 *  - 프로바이더 폴백 체인이 없다(사진은 배열, 여기는 프로바이더 하나) — BirdNET 하나뿐이라.
 *  - 프로바이더가 던진 에러를 여기서 삼키지 않는다. 사진 게이트웨이는 실패를 "unknown"으로
 *    감춰 항상 200을 내지만, doc03 9장은 "모델 오류는 5xx로 반환"이라고 명시했다 — 그래서
 *    이 메서드는 그대로 throw하고, 호출부(라우트)가 503으로 매핑한다.
 *  - taxon 매핑은 종(species) 정확 일치만 본다 — 사진의 "속(genus)으로 폴백" 개념이 없다
 *    (doc03: "미지원 모델 종은 확정 후보에서 제외"일 뿐, 상위 분류군 안내가 아님).
 *  - confidence_level은 후보마다 독립적으로 매겨 최대 3개까지 전부 노출한다(high/medium/low
 *    구분 없이 다 보여줌 — 사진처럼 tier 하나로 전체 응답 모양이 갈리지 않는다).
 */
import type { TaxonRepository } from "../../repositories/ports.js";
import { SafetyFilter } from "../../safety/SafetyFilter.js";
import {
  classifyConfidence,
  DEFAULT_THRESHOLDS,
  MAX_CANDIDATES_TO_SHOW,
  type ConfidenceThresholds,
} from "../../identification/confidencePolicy.js";
import type { AudioIdentificationProvider } from "./AudioIdentificationProvider.js";
import type { AudioIdentificationCandidate, AudioIdentificationOutcome } from "./audioIdentificationTypes.js";

export class AudioIdentificationGateway {
  private readonly safety = new SafetyFilter();

  constructor(
    private readonly provider: AudioIdentificationProvider,
    private readonly taxa: TaxonRepository,
    private readonly thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
  ) {}

  /**
   * wavBytes를 분석해 판정 결과를 낸다. 프로바이더 미설정/네트워크 실패/5xx는 그대로 throw한다
   * (위 파일 주석 참고 — 호출부가 503으로 매핑).
   */
  async identify(wavBytes: Buffer): Promise<AudioIdentificationOutcome> {
    const raw = await this.provider.analyze(wavBytes);

    const resolved: AudioIdentificationCandidate[] = [];
    for (const c of raw.candidates) {
      const taxon = await this.taxa.findBySciName(c.sciName);
      if (!taxon) continue; // "미지원 모델 종은 확정 후보에서 제외"

      const tier = classifyConfidence(c.score, this.thresholds);
      if (tier === "unknown") continue; // low 임계값(0.35) 미만은 후보로도 안 보여줌

      resolved.push({
        speciesId: taxon.id,
        commonNameKo: taxon.korName,
        scientificName: taxon.sciName,
        confidence: c.score,
        confidenceLevel: tier,
        startMs: c.startMs,
        endMs: c.endMs,
        isDangerous: this.safety.evaluate(taxon) !== null,
      });
    }

    // 프로바이더가 이미 score 내림차순으로 줬지만, taxon 필터링으로 순서가 흔들릴 일은 없어도
    // 명시적으로 재정렬해 게이트웨이 스스로 정렬을 보증한다(사진 게이트웨이와 같은 원칙).
    resolved.sort((a, b) => b.confidence - a.confidence);
    const top = resolved.slice(0, MAX_CANDIDATES_TO_SHOW);

    if (top.length === 0) {
      return {
        candidates: [],
        unknown: true,
        unknownReason: "NO_SUPPORTED_BIRD_MATCH",
        needsUserConfirmation: false,
        modelVersion: raw.modelVersion,
        locationPriorUsed: false, // hint(지역/시절) 반영은 아직 안 함 — STAGE2_MODEL_SERVICE.md "남은 일"
      };
    }
    return {
      candidates: top,
      unknown: false,
      needsUserConfirmation: true,
      modelVersion: raw.modelVersion,
      locationPriorUsed: false,
    };
  }
}
