/**
 * BioCLIP 하이브리드(오픈셋+프로토타입 교차검증) 추론 서버 어댑터 (B단계).
 *
 * GPU 서버(root@172.10.5.71)에서 systemd로 상시 구동 중인 FastAPI 서버(127.0.0.1:8931,
 * 127.0.0.1 전용 바인딩 -- SSH 로컬 포트포워딩으로만 접근)를 호출한다. `PlantIdProvider`/
 * `PlantNetProvider`와 달리 이 프로바이더는 실제로 fetch()를 실행하는 첫 프로바이더다.
 *
 * tier 인코딩: HybridClassifier.predict()가 이미 계산한 final_tier를, 인터페이스 변경 없이
 * confidenceForTier()로 confidence 숫자에 안전하게 인코딩한다(자세한 설계 근거는
 * confidenceForTier.ts 참고). 모든 후보에 동일하게 적용해 정렬 순서를 보존한다.
 */
import type {
  IdentificationProvider,
  IdentifyInput,
  ProviderResult,
  IdentificationCandidate,
} from "../IdentificationProvider.js";
import type { TaxonGroup, TaxonRank } from "../../domain/types.js";
import { confidenceForTier } from "../confidenceForTier.js";
import type { ConfidenceTier } from "../confidencePolicy.js";

export interface BioClipConfig {
  /** 예: "http://127.0.0.1:8931" (SSH 로컬 포트포워딩 대상). */
  endpoint: string;
  /** 기본 15000ms -- GPU 추론 자체는 수 초 내지만, 네트워크 왕복 여유를 둔다. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

/** GPU 서버 /identify 응답 중 이 프로바이더가 실제로 쓰는 필드만. */
interface BioClipServerCandidate {
  sciName: string;
  korName: string;
  score: number;
}

interface BioClipServerResponse {
  closed_full_ranking: BioClipServerCandidate[];
  final_tier: ConfidenceTier;
}

export class BioClipProvider implements IdentificationProvider {
  readonly name = "bioclip-hybrid";
  // MVP taxa(seed_taxa_export.json, 8종)가 현재 plant/insect/fungus만 포함(명세서상
  // bird/amphibian은 MVP 제외 -- domain/types.ts 주석과 일치). GPU 서버의 taxa 목록이
  // 확장되면(예: 파충류 프로토타입 종 추가) 여기도 함께 갱신해야 한다(수동 동기화).
  readonly supports: readonly TaxonGroup[] = ["plant", "insect", "fungus"];

  constructor(private readonly cfg: BioClipConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.endpoint);
  }

  async identify(input: IdentifyInput): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      throw new Error("[bioclip-hybrid] endpoint 미설정 -- 이 프로바이더는 사용 불가");
    }
    // MVP 범위: 다중 이미지 앙상블은 범위 밖 -- 첫 장만 사용.
    const image = input.images[0];
    if (!image) {
      throw new Error("[bioclip-hybrid] 이미지가 없음");
    }

    const res = await fetch(`${this.cfg.endpoint}/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: Buffer.from(image).toString("base64") }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`[bioclip-hybrid] 서버 오류 ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as BioClipServerResponse;
    return this.normalize(data);
  }

  private normalize(data: BioClipServerResponse): ProviderResult {
    // 모든 후보에 같은 final_tier를 동일하게 적용한다(top1에만 적용하면 게이트웨이의
    // 재정렬 과정에서 순서가 뒤바뀔 수 있음 -- confidenceForTier.ts 상단 주석 참고).
    const candidates: IdentificationCandidate[] = data.closed_full_ranking.map((c) => ({
      scientificName: c.sciName,
      vernacularName: c.korName,
      rank: "species" as TaxonRank, // 우리 후보군은 전부 종 단위 예측
      confidence: confidenceForTier(c.score, data.final_tier),
    }));
    return { candidates, source: this.name };
  }
}
