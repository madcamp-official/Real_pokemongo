/**
 * Pl@ntNet 어댑터 — 식물 (Plant.id 의 대체/보조 프로바이더).
 *
 * 게이트웨이는 여러 프로바이더를 우선순위로 시도하거나, 결과를 앙상블할 수 있다.
 * 여기서는 어댑터 골격만. TODO(제공 필요): PLANTNET_API_KEY + 응답 매핑.
 */
import type {
  IdentificationProvider,
  IdentifyInput,
  ProviderResult,
} from "../IdentificationProvider.js";
import type { TaxonGroup } from "../../domain/types.js";

export interface PlantNetConfig {
  apiKey?: string;
  endpoint: string;
}

export class PlantNetProvider implements IdentificationProvider {
  readonly name = "plantnet";
  readonly supports: readonly TaxonGroup[] = ["plant"];

  constructor(private readonly cfg: PlantNetConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  async identify(_input: IdentifyInput): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      throw new Error("[plantnet] API 키 미설정 — 이 프로바이더는 사용 불가");
    }
    // ── TODO(제공 필요): PlantNet v2 identify 호출 ──────────────────────────
    // GET/POST `${endpoint}/identify/all?api-key=...` (multipart 이미지)
    // 응답: results[].score(0..1), results[].species.scientificNameWithoutAuthor
    throw new Error("[plantnet] identify() 미구현 — 벤더 스펙 확정 후 매핑 필요");
  }
}
