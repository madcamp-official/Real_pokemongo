/**
 * Plant.id (kindwise) 어댑터 — 식물 및 insect.id(곤충).
 *
 * 이 파일은 "인터페이스 뒤의 어댑터" 예시다(명세서 §9). 실제 HTTP 호출부와 응답
 * 파싱은 벤더 문서에 맞춰 채운다. API 키가 공란이면 isConfigured()=false 를 반환해
 * 게이트웨이가 이 프로바이더를 건너뛰게 한다.
 *
 * TODO(제공 필요):
 *   - PLANT_ID_API_KEY (유료 키)
 *   - 아래 request/response 매핑을 Plant.id API v3 스펙에 맞춰 확정
 *     (엔드포인트: config.identification.plantId.endpoint)
 */
import type {
  IdentificationProvider,
  IdentifyInput,
  ProviderResult,
  IdentificationCandidate,
} from "../IdentificationProvider.js";
import type { TaxonGroup, TaxonRank } from "../../domain/types.js";

export interface PlantIdConfig {
  apiKey?: string;
  endpoint: string; // 식물
  insectEndpoint: string; // 곤충(insect.id)
}

export class PlantIdProvider implements IdentificationProvider {
  readonly name = "plant.id";
  readonly supports: readonly TaxonGroup[] = ["plant", "insect"];

  constructor(private readonly cfg: PlantIdConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  async identify(input: IdentifyInput): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      throw new Error("[plant.id] API 키 미설정 — 이 프로바이더는 사용 불가");
    }

    const isInsect = input.groupHint === "insect";
    const endpoint = isInsect ? this.cfg.insectEndpoint : this.cfg.endpoint;

    // ── TODO(제공 필요): 실제 호출 구현 ──────────────────────────────────────
    // Plant.id v3 는 base64 이미지 배열 + suggestions 응답 구조를 쓴다.
    // 대략의 형태(벤더 스펙 확정 후 교정):
    //
    // const body = {
    //   images: input.images.map(toBase64),
    //   similar_images: true,
    // };
    // const res = await fetch(`${endpoint}/identification`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json", "Api-Key": this.cfg.apiKey! },
    //   body: JSON.stringify(body),
    // });
    // const json = await res.json();
    // return this.normalize(json);
    //
    // 지금은 미구현 상태를 명확히 드러낸다(조용한 오답보다 명시적 실패).
    throw new Error(
      "[plant.id] identify() 미구현 — 벤더 스펙 확정 후 request/response 매핑 필요",
    );
  }

  /**
   * 벤더 응답 → 표준 ProviderResult 정규화. 스펙 확정 후 채운다.
   * (형태만 제시: suggestions[].name(학명), .probability(0..1))
   */
  // deno-lint-ignore no-unused-vars
  private normalize(vendorJson: unknown): ProviderResult {
    const candidates: IdentificationCandidate[] = [];
    // TODO(제공 필요): vendorJson.result.classification.suggestions 매핑
    //   name -> scientificName, probability -> confidence, rank 추정 -> rank
    return { source: this.name, candidates };
  }
}

/** 벤더가 명시하지 않는 계급을 학명 형태로 추정(종명 2어절 = species). */
export function guessRankFromName(sciName: string): TaxonRank {
  const parts = sciName.trim().split(/\s+/);
  if (parts.length >= 2) return "species";
  return "genus";
}
