/**
 * 오디오 픽스처 (테스트 전용). `core/media/fixtures.ts`와 같은 철학이지만, 오디오는
 * 컨테이너 구조를 손으로 짜맞추는 대신 **로컬에 설치된 ffmpeg로 실제 디코딩 가능한
 * 합성음**을 만든다 — AudioConverter가 진짜 ffmpeg 서브프로세스를 실행하므로, 구조만
 * 맞고 실제로는 디코딩 안 되는 가짜 바이트로는 변환 성공 경로를 검증할 수 없다
 * (sightings.routes.test.ts가 sharp로 진짜 JPEG를 만드는 것과 같은 이유).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** 매직 바이트만 맞춘(디코딩 불가능한) 최소 WAV — AudioSignature 단위테스트 전용. */
export function makeMinimalWavSignatureOnly(): Uint8Array {
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, // "RIFF" + size(무의미)
    0x57, 0x41, 0x56, 0x45, // "WAVE"
  ]);
}

/** 매직 바이트만 맞춘(디코딩 불가능한) 최소 M4A — AudioSignature 단위테스트 전용. */
export function makeMinimalM4aSignatureOnly(): Uint8Array {
  return Uint8Array.from([
    0x00, 0x00, 0x00, 0x18, // 박스 크기(임의)
    0x66, 0x74, 0x79, 0x70, // "ftyp"
    0x4d, 0x34, 0x41, 0x20, // major brand "M4A "
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
  });
}

function runPowerShell(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // 인자 배열로 넘긴다(셸 개입 없음) — AudioConverter의 ffmpeg 호출과 같은 원칙.
    const child = spawn("powershell.exe", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(stderr))));
  });
}

/**
 * ffmpeg의 lavfi 소스로 실제 디코딩 가능한 합성 오디오를 만든다. 새 소리 저작권 걱정 없이
 * (합성음이라 라이선스 이슈 자체가 없음) 진짜 인코더 산출물을 테스트에 쓸 수 있다.
 *
 * 완전히 고정된 순음이 아니라 살짝 주파수가 변하는 소리를 쓴다(900→1100Hz 처프) — 4단계
 * AudioQualityAnalyzer가 배포된 뒤로는, 끊김 없이 완벽하게 고정된 순음은 그 자체로
 * UNSUPPORTED_SOUND(비정상적으로 안정된 지속음)에 정확히 걸리는 게 "의도된 동작"이라
 * (AudioQualityAnalyzer.ts 참고), 3단계 업로드/변환 경로만 검증하려는 이 픽스처가 그 판정에
 * 걸려 넘어지면 안 된다 — 그래서 AudioQualityAnalyzer.test.ts의 전용 톤 생성기(makeTone)와는
 * 목적이 다르다.
 */
export async function makeRealAudio(opts: {
  seconds: number;
  format: "wav" | "m4a";
  sampleRate?: number;
  channels?: number;
}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "seed-audio-fixture-"));
  const ext = opts.format === "wav" ? "wav" : "m4a";
  const outPath = join(dir, `${randomUUID()}.${ext}`);
  try {
    const codecArgs =
      opts.format === "wav" ? ["-acodec", "pcm_s16le"] : ["-acodec", "aac", "-b:a", "64k"];
    // 1500Hz에서 시작해 초당 600Hz씩 올라가는 처프(AudioQualityAnalyzer.test.ts의 "정상
    // 녹음" 테스트와 동일한 계수) — 짧은 길이에서도 peakHzStd가 고정-톤 판정 임계값(150Hz)을
    // 확실히 넘도록 길이에 비례해 스케일하지 않고 고정 계수를 쓴다.
    await runFfmpeg([
      "-y",
      "-f", "lavfi",
      "-i",
      `aevalsrc=0.5*sin(2*PI*(1500+300*t)*t):s=${opts.sampleRate ?? 44100}:d=${opts.seconds}`,
      "-ac", String(opts.channels ?? 2),
      ...codecArgs,
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * AudioQualityAnalyzer 테스트 전용 합성 오디오 생성기들. 전부 48kHz mono pcm_s16le WAV로
 * 직접 만든다 — AudioConverter의 출력 형태와 동일해서, 분석기를 변환 파이프라인과 분리해
 * 테스트할 수 있다. 각 함수가 만드는 신호의 실측 특성은 AudioQualityAnalyzer.ts 상단
 * 주석의 보정 근거와 1:1로 대응한다.
 */
async function runFfmpegToFile(args: string[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "seed-audio-fixture-"));
  const outPath = join(dir, `${randomUUID()}.wav`);
  try {
    await runFfmpeg([...args, outPath]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const WAV_ARGS = ["-ac", "1", "-ar", "48000", "-acodec", "pcm_s16le"];

/** 진짜 무음(anullsrc). */
export function makeSilence(seconds: number): Promise<Buffer> {
  return runFfmpegToFile([
    "-y", "-f", "lavfi", "-i", `anullsrc=r=48000:cl=mono`, "-t", String(seconds), ...WAV_ARGS,
  ]);
}

/** 백색잡음(anoisesrc). amplitude가 낮으면(예: 0.003) "조용한 룸톤", 높으면(예: 0.5) "시끄러운 잡음". */
export function makeWhiteNoise(seconds: number, amplitude: number): Promise<Buffer> {
  return runFfmpegToFile([
    "-y", "-f", "lavfi", "-i", `anoisesrc=r=48000:c=white:a=${amplitude}`, "-t", String(seconds), ...WAV_ARGS,
  ]);
}

/** 순수 사인파 톤. volumeDb로 증폭해 진폭을 통제한다(기본 ffmpeg sine 소스는 진폭이 낮음, 실측 확인됨). */
export function makeTone(seconds: number, frequencyHz: number, volumeDb = 6): Promise<Buffer> {
  return runFfmpegToFile([
    "-y", "-f", "lavfi", "-i", `sine=frequency=${frequencyHz}:duration=${seconds}:sample_rate=48000`,
    "-af", `volume=${volumeDb}dB`, ...WAV_ARGS,
  ]);
}

/** 풀스케일을 훨씬 넘게 증폭해 pcm_s16le 저장 시 강제로 클리핑되는 톤. */
export function makeClippedTone(seconds: number, frequencyHz = 1000): Promise<Buffer> {
  return makeTone(seconds, frequencyHz, 24);
}

/** 주파수가 시간에 따라 변하는 처프 — "새소리다운 주파수 변조"의 대리 신호(고정 톤과 대조군). */
export function makeChirp(seconds: number, startHz: number, sweepHzPerSec: number): Promise<Buffer> {
  const expr = `0.5*sin(2*PI*(${startHz}+${sweepHzPerSec}*t)*t)`;
  return runFfmpegToFile([
    "-y", "-f", "lavfi", "-i", `aevalsrc=${expr}:s=48000:d=${seconds}`, ...WAV_ARGS,
  ]);
}

/** 서로 다른 두 사인파를 동시에 섞는다 — 배음 관계(정수비)면 "하나의 소리", 아니면 "중첩된 두 소리". */
export function makeMixedTones(seconds: number, freqAHz: number, freqBHz: number): Promise<Buffer> {
  const dir = mkdtemp(join(tmpdir(), "seed-audio-fixture-"));
  return dir.then(async (d) => {
    const outPath = join(d, `${randomUUID()}.wav`);
    try {
      await runFfmpeg([
        "-y",
        "-f", "lavfi", "-i", `sine=frequency=${freqAHz}:duration=${seconds}:sample_rate=48000`,
        "-f", "lavfi", "-i", `sine=frequency=${freqBHz}:duration=${seconds}:sample_rate=48000`,
        "-filter_complex", "amix=inputs=2:duration=first",
        ...WAV_ARGS,
        outPath,
      ]);
      return await readFile(outPath);
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
}

/**
 * Windows 내장 TTS(System.Speech)로 진짜 사람 음성 WAV를 만든다 — 화이트노이즈/톤 같은
 * 대리 신호가 아니라 실제 음성 신호로 SPEECH_DETECTED를 검증하기 위함(이 프로젝트의 다른
 * 오디오 픽스처들과 같은 원칙: 가짜 대신 진짜 디코딩 가능한 소스). Windows 전용 — 이 저장소의
 * 오디오 테스트는 이미 로컬 ffmpeg 설치를 전제하므로 같은 개발 환경 가정 범위 안에 있다.
 */
export async function makeRealSpeech(text: string, rate = 0): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "seed-audio-fixture-"));
  const scriptPath = join(dir, "speak.ps1");
  const rawPath = join(dir, "raw.wav");
  const outPath = join(dir, "out.wav");
  try {
    const script = [
      "param([string]$Text, [string]$OutFile, [int]$Rate)",
      "Add-Type -AssemblyName System.Speech",
      "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$synth.Rate = $Rate",
      "$synth.SetOutputToWaveFile($OutFile)",
      "$synth.Speak($Text)",
      "$synth.Dispose()",
    ].join("\n");
    await writeFile(scriptPath, script, "utf-8");
    await runPowerShell([
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", scriptPath, "-Text", text, "-OutFile", rawPath, "-Rate", String(rate),
    ]);
    await runFfmpeg(["-y", "-i", rawPath, ...WAV_ARGS, outPath]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
