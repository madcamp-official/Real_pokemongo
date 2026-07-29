/**
 * 오디오 표준화(3단계 "변환") — 입력(M4A/MP4 계열 또는 WAV)을 48kHz mono PCM WAV로
 * 바꾼다. BirdNET이 요구하는 입력(48kHz mono, `seed-service/research/audio-model-spike/
 * SPIKE_REPORT.md`에서 실측 확인)과 맞춘 것 — 값을 바꾸려면 그 spike 결과부터 다시
 * 확인해야 한다.
 *
 * 변환기 보호(doc 03 3단계 "변환기 보호" 요구사항 그대로 구현):
 *   - CPU·시간 제한: 자식 프로세스에 하드 타임아웃을 걸고, 넘으면 SIGKILL.
 *   - 임의 파일 경로 금지: 입출력 파일명은 항상 이 모듈이 randomUUID()로 생성한다 —
 *     클라이언트가 보낸 파일명/경로는 애초에 어디에도 쓰이지 않는다.
 *   - 명령 인자 안전 처리: `child_process.spawn`에 인자를 배열로 넘긴다(셸 개입 없음,
 *     문자열 이어붙이기로 명령을 구성하지 않으므로 인자 인젝션 여지가 없다).
 *   - 손상 파일 거부: ffmpeg가 0이 아닌 종료 코드를 내면 decode_failed로 처리.
 *   - 임시 변환 파일 정리: 성공/실패 관계없이 finally에서 입출력 임시 파일을 지운다.
 *
 * "압축 폭탄" 방어: 오디오 코덱은 zip과 달리 극단적 압축비를 갖지 않아 압축 해제
 * 자체가 폭발적으로 커지진 않는다 — 대신 "비정상적으로 긴 오디오를 변환하느라 CPU를
 * 오래 쓰게 만드는" 것이 실질적 위협이라 보고, 타임아웃(시간 제한)과 변환 후 실제 길이
 * 검증(아래 too_long)으로 방어한다. 길이를 ffmpeg `-t`로 조용히 잘라내지 않는다 —
 * 그러면 "15초 넘는 녹음"이 소리 소문 없이 15초로 잘려 저장되는데, 이건 doc 03이 요구하는
 * "잘못된 파일이 모델에 전달되지 않는다"는 완료 기준과 어긋난다(자르지 말고 거부해야 함).
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { detectAudioFormat } from "./AudioSignature.js";
import { parseWavInfo } from "./wavUtils.js";

/** BirdNET 권장 입력(SPIKE_REPORT.md 실측) — 값을 바꾸려면 그 문서부터 갱신할 것. */
const TARGET_SAMPLE_RATE = 48000;

export type AudioConversionErrorCode = "decode_failed" | "timeout" | "too_long";

export class AudioConversionError extends Error {
  constructor(
    public readonly code: AudioConversionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AudioConversionError";
  }
}

export interface ConvertedAudio {
  wavBytes: Buffer;
  durationMs: number;
  sampleRate: number;
}

export interface AudioConverterOptions {
  /** 입출력 임시 파일을 두는 디렉터리(AUDIO_TEMP_DIR). */
  tempDir: string;
  maxDurationSeconds: number;
  /** ffmpeg 자식 프로세스 하드 타임아웃(ms). */
  timeoutMs: number;
}

export class AudioConverter {
  constructor(private readonly opts: AudioConverterOptions) {}

  async convertToMonoPcmWav(input: Buffer): Promise<ConvertedAudio> {
    // 시그니처 확인이 먼저 — 미지 포맷이면 ffmpeg를 아예 실행하지 않는다(불필요한 프로세스
    // 기동 자체를 아끼고, sanitizeImage와 동일하게 "확장자/MIME 대신 바이트로 판별" 원칙 적용).
    detectAudioFormat(input); // 실패 시 UnsupportedAudioFormatError를 그대로 던짐(호출부가 400 매핑)

    await mkdir(this.opts.tempDir, { recursive: true });
    const inputPath = join(this.opts.tempDir, `${randomUUID()}.in`);
    const outputPath = join(this.opts.tempDir, `${randomUUID()}.wav`);

    try {
      await writeFile(inputPath, input);
      await this.runFfmpeg(inputPath, outputPath);

      const wavBytes = await readFile(outputPath);
      const info = parseWavInfo(wavBytes);

      if (info.durationMs > this.opts.maxDurationSeconds * 1000) {
        throw new AudioConversionError(
          "too_long",
          `오디오 길이(${info.durationMs}ms)가 최대(${this.opts.maxDurationSeconds}s)를 초과했습니다.`,
        );
      }

      return { wavBytes, durationMs: info.durationMs, sampleRate: info.sampleRate };
    } finally {
      await unlink(inputPath).catch(() => undefined);
      await unlink(outputPath).catch(() => undefined);
    }
  }

  private runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        "-y",
        "-i", inputPath,
        "-vn", // 오디오 스트림만(썸네일/커버아트로 딸려오는 비디오 스트림 무시)
        "-ac", "1",
        "-ar", String(TARGET_SAMPLE_RATE),
        "-acodec", "pcm_s16le",
        outputPath,
      ];
      const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

      let stderr = "";
      let settled = false;
      child.stderr.on("data", (chunk: Buffer) => {
        // 무한정 누적하지 않는다(악성/손상 입력이 로그를 폭주시키는 걸 방지) — 에러
        // 메시지에는 마지막 일부만 있으면 충분하다.
        stderr = (stderr + chunk.toString()).slice(-2000);
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new AudioConversionError("timeout", "오디오 변환이 시간 제한을 초과했습니다."));
      }, this.opts.timeoutMs);

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new AudioConversionError("decode_failed", `ffmpeg 실행 실패: ${err.message}`));
      });

      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(
            new AudioConversionError(
              "decode_failed",
              `ffmpeg 종료 코드 ${code}: ${stderr}`,
            ),
          );
        }
      });
    });
  }
}
