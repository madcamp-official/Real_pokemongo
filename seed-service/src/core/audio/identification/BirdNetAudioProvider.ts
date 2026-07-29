/**
 * CAMP-3의 `audio-model-inference.service`(BirdNET, `/internal/audio/analyze`) 호출.
 * `core/identification/providers/BioClipProvider.ts`와 같은 원칙(네이티브 fetch, endpoint
 * 자체가 온/오프 스위치, AbortSignal.timeout, !res.ok → 텍스트 읽고 단일 Error throw)을
 * 그대로 따른다.
 *
 * 실제 응답 형태는 CAMP-3에 SSH 터널을 열고 진짜 오디오로 `/internal/audio/analyze`를
 * 직접 호출해 확인했다(2026-07-28, 6초 합성음 입력):
 *   {"model_version":"birdnet-acoustic-2.4-pb",
 *    "quality":{"duration_s":6,"sample_rate":48000,"segment_duration_s":3},
 *    "segments":[
 *      {"start_s":0,"end_s":3,"candidates":[{sci_name,label,score}, ...5개, score 내림차순], "embedding":[...]},
 *      {"start_s":3,"end_s":6,"candidates":[...5개...], "embedding":[...]}
 *    ]}
 * 세그먼트당 후보는 **정확히 5개**로 실측 확인(추측 아님) — STAGE2_MODEL_SERVICE.md 문서엔
 * 개수가 명시돼 있지 않았다. embedding은 여기서 쓰지 않는다(8단계 유사도 전용).
 */
import type {
  AudioIdentificationProvider,
  AudioAnalysisResult,
  RawAudioCandidate,
} from "./AudioIdentificationProvider.js";

export interface BirdNetAudioConfig {
  endpoint: string;
  timeoutMs?: number;
  token?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;

interface ModelSegmentCandidate {
  sci_name: string;
  label: string;
  score: number;
}
interface ModelSegment {
  start_s: number;
  end_s: number;
  candidates: ModelSegmentCandidate[];
  embedding: number[];
}
interface ModelAnalyzeResponse {
  model_version: string;
  quality: { duration_s: number; sample_rate: number; segment_duration_s: number };
  segments: ModelSegment[];
}

export class BirdNetAudioProvider implements AudioIdentificationProvider {
  readonly name = "birdnet-audio";

  constructor(private readonly cfg: BirdNetAudioConfig) {}

  isConfigured(): boolean {
    return Boolean(this.cfg.endpoint);
  }

  async analyze(wavBytes: Buffer): Promise<AudioAnalysisResult> {
    if (!this.isConfigured()) {
      throw new Error("[birdnet-audio] endpoint 미설정 — 이 프로바이더는 사용 불가");
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
      throw new Error(`[birdnet-audio] 서버 오류 ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as ModelAnalyzeResponse;
    return this.aggregate(data);
  }

  /** 세그먼트마다 나온 후보들을 종(sci_name) 단위로 묶어, 가장 높은 점수와 그 점수가 나온
   * 구간(start_ms/end_ms)만 남긴다 — 여러 세그먼트에 걸쳐 같은 새가 반복 검출돼도 후보
   * 목록엔 한 번만, "가장 자신 있었던 순간"의 시간창과 함께 나온다. */
  private aggregate(data: ModelAnalyzeResponse): AudioAnalysisResult {
    const bestBySciName = new Map<string, RawAudioCandidate>();
    for (const seg of data.segments) {
      for (const c of seg.candidates) {
        const existing = bestBySciName.get(c.sci_name);
        if (!existing || c.score > existing.score) {
          bestBySciName.set(c.sci_name, {
            sciName: c.sci_name,
            label: c.label,
            score: c.score,
            startMs: Math.round(seg.start_s * 1000),
            endMs: Math.round(seg.end_s * 1000),
          });
        }
      }
    }
    const candidates = [...bestBySciName.values()].sort((a, b) => b.score - a.score);
    return { candidates, modelVersion: data.model_version };
  }
}
