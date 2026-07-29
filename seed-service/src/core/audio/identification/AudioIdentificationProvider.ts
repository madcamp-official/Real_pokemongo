/**
 * 오디오 동정 프로바이더 인터페이스 — doc03 9장이 나열한 "BirdNetAudioProvider"의 계약.
 * 사진 파이프라인의 `IdentificationProvider`(providers 배열로 폴백 체인)와 달리, 지금은
 * BirdNET 하나뿐이라 게이트웨이가 배열이 아니라 단일 프로바이더를 받는다 — 그래도 인터페이스로
 * 분리해두는 이유는 그대로다(테스트에서 실제 GPU 서버 없이 모킹, 나중에 Perch 등 다른 모델로
 * 교체 가능성, SPIKE_REPORT.md "성능이 부족할 때만 Perch 검토").
 */

/** 모델이 실제로 낸 원시 후보 — 세그먼트 여러 개에 걸쳐 이미 종별 최고점으로 집계된 것.
 * taxon 매핑/임계값 판정은 게이트웨이 책임이라 여기엔 없다(정직한 범위 구분). */
export interface RawAudioCandidate {
  sciName: string;
  label: string;
  score: number;
  startMs: number;
  endMs: number;
}

export interface AudioAnalysisResult {
  candidates: RawAudioCandidate[]; // score 내림차순
  modelVersion: string;
}

export interface AudioIdentificationProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** wavBytes는 이미 변환된(mono 48kHz PCM) 바이트 — AudioConverter 출력 그대로. */
  analyze(wavBytes: Buffer): Promise<AudioAnalysisResult>;
}
