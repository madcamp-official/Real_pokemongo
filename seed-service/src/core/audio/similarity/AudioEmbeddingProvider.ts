/** 8단계 임베딩 추출 프로바이더 인터페이스 — `AudioIdentificationProvider.ts`와 같은 이유로
 * 인터페이스로 분리(테스트에서 모킹, 다른 모델로 교체 가능성). */

export interface AudioEmbeddingSegment {
  startMs: number;
  endMs: number;
  embedding: number[];
}

export interface AudioEmbeddingResult {
  modelVersion: string;
  segments: AudioEmbeddingSegment[]; // 시간순
}

export interface AudioEmbeddingProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** wavBytes는 이미 변환된(mono 48kHz PCM) 바이트. */
  embed(wavBytes: Buffer): Promise<AudioEmbeddingResult>;
}
