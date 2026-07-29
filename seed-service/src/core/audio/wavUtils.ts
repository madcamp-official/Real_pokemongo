/**
 * 최소 WAV(RIFF/PCM) 헤더 파서. AudioConverter가 ffmpeg로 만든 출력(mono, pcm_s16le)의
 * 실제 길이/샘플레이트를 클라이언트가 보낸 duration_ms를 신뢰하지 않고 서버가 직접
 * 검증하기 위해 쓴다(doc 03 3단계 "duration_ms: 클라이언트 측정, 서버 디코드로 검증").
 */

export class InvalidWavError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWavError";
  }
}

export interface WavInfo {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  durationMs: number;
  /** `data` 청크의 실제 오디오 바이트 시작 오프셋(파일 처음부터). pcmUtils.ts가 샘플을
   * 직접 읽어낼 때 쓴다. */
  dataOffset: number;
  /** `data` 청크 크기(바이트) — 파일 끝을 넘는 잘못된 헤더 크기는 실제 남은 바이트로 자른다. */
  dataSize: number;
}

/** 청크를 순회하며 "fmt "와 "data"를 찾는다 — JUNK/LIST 등 다른 청크가 끼어 있어도 안전. */
export function parseWavInfo(bytes: Uint8Array): WavInfo {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46 || // RIFF
    bytes[8] !== 0x57 || bytes[9] !== 0x41 || bytes[10] !== 0x56 || bytes[11] !== 0x45 // WAVE
  ) {
    throw new InvalidWavError("RIFF/WAVE 헤더가 아닙니다.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate: number | undefined;
  let numChannels: number | undefined;
  let bitsPerSample: number | undefined;
  let dataSize: number | undefined;
  let dataOffset: number | undefined;

  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(
      bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!,
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;

    if (chunkId === "fmt " && dataStart + 16 <= bytes.length) {
      numChannels = view.getUint16(dataStart + 2, true);
      sampleRate = view.getUint32(dataStart + 4, true);
      bitsPerSample = view.getUint16(dataStart + 14, true);
    } else if (chunkId === "data") {
      dataSize = Math.min(chunkSize, bytes.length - dataStart);
      dataOffset = dataStart;
    }

    // 청크는 짝수 바이트로 정렬된다(홀수 크기면 패딩 1바이트).
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  if (sampleRate === undefined || numChannels === undefined || bitsPerSample === undefined) {
    throw new InvalidWavError("fmt 청크를 찾지 못했습니다.");
  }
  if (dataSize === undefined || dataOffset === undefined) {
    throw new InvalidWavError("data 청크를 찾지 못했습니다.");
  }
  const bytesPerSample = bitsPerSample / 8;
  if (bytesPerSample <= 0 || numChannels <= 0 || sampleRate <= 0) {
    throw new InvalidWavError("fmt 청크 값이 올바르지 않습니다.");
  }

  const totalSamples = dataSize / (bytesPerSample * numChannels);
  const durationMs = Math.round((totalSamples / sampleRate) * 1000);
  return { sampleRate, numChannels, bitsPerSample, durationMs, dataOffset, dataSize };
}
