/**
 * CAMP-3의 `/internal/audio/analyze`를 재사용해 구간별 임베딩만 뽑아낸다.
 *
 * Stage 2가 만든 전용 엔드포인트 `/internal/audio/similarity`(요청에 참조 임베딩 하나를
 * 실어 보내면 평균-풀링된 코사인 유사도 하나만 돌려줌, STAGE2_MODEL_SERVICE.md 참고)를
 * 쓰지 않고 굳이 `/internal/audio/analyze`를 다시 부르는 이유: 공유 계약 fixture
 * (`fixtures/similarity-success.json`)가 `matched_segment`(어느 구간이 가장 잘 맞았는지)를
 * 요구하는데, `/internal/audio/similarity`는 세그먼트 정보를 아예 안 돌려준다. `/analyze`는
 * 세그먼트별 임베딩을 그대로 주므로, 참조 클립 임베딩과의 코사인 유사도를 세그먼트마다
 * 직접 계산하면 최고 유사도와 그 구간을 동시에 얻을 수 있다(SimilarityGateway.ts 참고) —
 * 네트워크 호출도 하나로 끝난다(similarity 엔드포인트를 따로 부를 필요가 없어짐).
 *
 * `BirdNetAudioProvider.ts`(6단계, 동정용)와 같은 엔드포인트를 부르지만 다른 클래스로
 * 분리했다 — 동정은 candidates만, 이건 embedding만 필요해 파싱 결과 타입이 다르고,
 * 두 관심사를 한 클래스에 섞으면 "동정 결과에 임베딩이 섞여 있는" 어색한 반환 타입이
 * 된다(정직한 범위 구분).
 */
import type { AudioEmbeddingProvider, AudioEmbeddingResult } from "./AudioEmbeddingProvider.js";

export interface BirdNetEmbeddingConfig {
  endpoint: string;
  timeoutMs?: number;
  token?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

interface ModelSegment {
  start_s: number;
  end_s: number;
  embedding: number[];
}
interface ModelAnalyzeResponse {
  model_version: string;
  segments: ModelSegment[];
}

export class BirdNetEmbeddingProvider implements AudioEmbeddingProvider {
  readonly name = "birdnet-embedding";

  constructor(private readonly cfg: BirdNetEmbeddingConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.endpoint);
  }

  async embed(wavBytes: Buffer): Promise<AudioEmbeddingResult> {
    if (!this.isConfigured()) {
      throw new Error("[birdnet-embedding] endpoint 미설정 — 이 프로바이더는 사용 불가");
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.token) headers.Authorization = `Bearer ${this.cfg.token}`;

    const res = await fetch(`${this.cfg.endpoint}/internal/audio/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({ audio_base64: wavBytes.toString("base64") }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`[birdnet-embedding] 서버 오류 ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as ModelAnalyzeResponse;
    return {
      modelVersion: data.model_version,
      segments: data.segments.map((s) => ({
        startMs: Math.round(s.start_s * 1000),
        endMs: Math.round(s.end_s * 1000),
        embedding: s.embedding,
      })),
    };
  }
}
