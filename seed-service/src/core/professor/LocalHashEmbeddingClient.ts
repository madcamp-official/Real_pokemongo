import type { EmbeddingClient, EmbeddingResult } from "./professorTypes.js";

/**
 * 개발·테스트 전용 결정론적 임베딩.
 * 실제 운영은 다국어 sentence-transformer 워커를 사용한다. 워커가 없는 개발 환경에서도
 * 앱 흐름과 공개/안전 정책을 검증할 수 있도록 문자 n-gram을 384차원에 해싱한다.
 */
export class LocalHashEmbeddingClient implements EmbeddingClient {
  static readonly modelId = "nature-go-local-hash-embedding";
  static readonly modelRevision = "v1";
  static readonly dimension = 384;

  async embed(text: string): Promise<EmbeddingResult> {
    const vector = new Array<number>(LocalHashEmbeddingClient.dimension).fill(0);
    const normalizedText = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    const compact = normalizedText.replace(/\s/g, "");
    const tokens = normalizedText.split(" ").filter(Boolean);
    const features = [
      ...tokens.map((token) => `w:${token}`),
      ...Array.from({ length: Math.max(0, compact.length - 1) }, (_, i) => `b:${compact.slice(i, i + 2)}`),
      ...Array.from({ length: Math.max(0, compact.length - 2) }, (_, i) => `t:${compact.slice(i, i + 3)}`),
    ];

    for (const feature of features) {
      const [index, sign] = hashFeature(feature, vector.length);
      vector[index] = vector[index]! + sign;
    }
    normalizeVector(vector);
    return {
      model_id: LocalHashEmbeddingClient.modelId,
      model_revision: LocalHashEmbeddingClient.modelRevision,
      dimension: vector.length,
      normalized: true,
      vector,
    };
  }
}

function hashFeature(value: string, dimension: number): [number, number] {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return [unsigned % dimension, unsigned & 1 ? 1 : -1];
}

function normalizeVector(vector: number[]): void {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = vector[index]! / norm;
  }
}
