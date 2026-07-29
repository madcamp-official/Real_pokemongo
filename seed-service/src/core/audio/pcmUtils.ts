/**
 * WAV(mono, 16bit PCM) 바이트에서 실제 샘플 배열을 뽑아낸다. `AudioConverter`가 항상
 * `pcm_s16le` + `-ac 1`로 인코딩하므로 여기서는 mono 16비트만 지원한다 — 그 전제가 깨지면
 * (예: 변환 목표를 바꾸면) 이 파일도 같이 갱신해야 한다.
 *
 * DataView로 직접 읽는 이유: Int16Array로 버퍼를 그대로 캐스팅하면 (1) data 청크 오프셋이
 * 2바이트 정렬이 아닐 가능성, (2) 호스트가 빅엔디안일 가능성에서 조용히 틀린 값을 만들 수
 * 있다 — WAV는 항상 리틀엔디안이므로 플랫폼 엔디안에 기대지 않고 명시적으로 읽는다.
 */
import { parseWavInfo, InvalidWavError } from "./wavUtils.js";

export interface PcmAudio {
  /** -1..1로 정규화된 샘플(분석 코드가 풀스케일 상수를 반복하지 않도록). */
  samples: Float64Array;
  sampleRate: number;
}

const FULL_SCALE_16BIT = 32768;

export function extractPcm16Mono(wavBytes: Uint8Array): PcmAudio {
  const info = parseWavInfo(wavBytes);
  if (info.numChannels !== 1) {
    throw new InvalidWavError(`mono가 아닙니다(channels=${info.numChannels}).`);
  }
  if (info.bitsPerSample !== 16) {
    throw new InvalidWavError(`16bit PCM이 아닙니다(bitsPerSample=${info.bitsPerSample}).`);
  }

  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  const numSamples = Math.floor(info.dataSize / 2);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const raw = view.getInt16(info.dataOffset + i * 2, true);
    samples[i] = raw / FULL_SCALE_16BIT;
  }
  return { samples, sampleRate: info.sampleRate };
}
