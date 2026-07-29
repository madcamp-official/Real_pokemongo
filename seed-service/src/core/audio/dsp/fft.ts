/**
 * 최소 radix-2 FFT 구현 — 외부 DSP 라이브러리 의존 없이 AudioQualityAnalyzer가 필요로
 * 하는 스펙트럼(주파수별 에너지)을 계산하기 위한 것. 반드시 2의 거듭제곱 길이에서만
 * 동작한다(호출부가 프레임을 그 길이로 맞춘다).
 *
 * 정확성은 코드 리뷰만으로 보장할 수 없어서 fft.test.ts에서 다음을 직접 검증한다:
 *  - 순수 톤(sine) 입력 → 피크가 기대한 주파수 bin에 정확히 나타나는지
 *  - Parseval 정리(시간영역 에너지 합 = 주파수영역 에너지 합/N) — 구현 버그(스케일링,
 *    나비 연산 오류 등)가 있으면 이 항등식이 깨지므로 강력한 회귀 검증이 된다
 */

/** N이 2의 거듭제곱이 아니면 바로 위 2의 거듭제곱으로 올림. */
export function nextPow2(n: number): number {
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * in-place iterative radix-2 Cooley-Tukey FFT. `real`/`imag` 길이는 2의 거듭제곱이어야
 * 하며, 둘 다 같은 길이여야 한다. 결과는 같은 배열에 덮어써진다(관례적인 FFT API 형태).
 */
export function fftInPlace(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n !== imag.length) {
    throw new Error("real/imag 길이가 다릅니다.");
  }
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT 길이는 2의 거듭제곱이어야 합니다(받은 값: ${n}).`);
  }

  // 비트 반전(bit-reversal) 순열
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = real[i]!; real[i] = real[j]!; real[j] = tr;
      const ti = imag[i]!; imag[i] = imag[j]!; imag[j] = ti;
    }
  }

  // 나비(butterfly) 연산
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const evenIdx = start + k;
        const oddIdx = start + k + half;
        const or_ = real[oddIdx]! * wr - imag[oddIdx]! * wi;
        const oi_ = real[oddIdx]! * wi + imag[oddIdx]! * wr;
        real[oddIdx] = real[evenIdx]! - or_;
        imag[oddIdx] = imag[evenIdx]! - oi_;
        real[evenIdx] = real[evenIdx]! + or_;
        imag[evenIdx] = imag[evenIdx]! + oi_;
      }
    }
  }
}

/**
 * 실수 입력(오디오 프레임)의 크기 스펙트럼을 계산한다. 반환값은 [0, Nyquist] 구간의
 * bin만 포함한다(길이 frameSize/2 + 1) — 실수 신호는 스펙트럼이 켤레대칭이라 나머지
 * 절반은 중복 정보다.
 */
export function magnitudeSpectrum(frame: Float64Array): Float64Array {
  const n = frame.length;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  real.set(frame);
  fftInPlace(real, imag);

  const half = n / 2;
  const mags = new Float64Array(half + 1);
  for (let i = 0; i <= half; i++) {
    mags[i] = Math.hypot(real[i]!, imag[i]!);
  }
  return mags;
}

/** bin 인덱스를 실제 주파수(Hz)로 변환. */
export function binToHz(binIndex: number, frameSize: number, sampleRate: number): number {
  return (binIndex * sampleRate) / frameSize;
}

/** 주파수(Hz)를 가장 가까운 bin 인덱스로 변환(0..frameSize/2 범위로 클램프). */
export function hzToBin(hz: number, frameSize: number, sampleRate: number): number {
  const bin = Math.round((hz * frameSize) / sampleRate);
  return Math.max(0, Math.min(frameSize / 2, bin));
}
