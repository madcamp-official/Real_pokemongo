/**
 * 오디오 파일 시그니처(매직 바이트) 판별 — `MediaSanitizer.ts`(이미지)와 같은 원칙:
 * 확장자나 클라이언트가 보낸 Content-Type을 신뢰하지 않고, 바이트 자체로 포맷을
 * 판별한다(`03_소리기능_서버_GPU_구현계획_팀원.md` 3단계 "확장자나 클라이언트 MIME을
 * 신뢰하지 않음").
 *
 * 이미지 정화기(sanitizeImage)와 달리 여기서는 EXIF류 메타데이터를 바이트 단위로
 * 제거하지 않는다 — AudioConverter가 ffmpeg로 mono PCM WAV로 다시 인코딩하는 과정
 * 자체가 컨테이너(M4A/MP4의 udta/meta 박스 등) 메타데이터를 전부 버리므로, "정화"는
 * 변환이라는 부수효과로 이미 달성된다. 이 모듈의 역할은 오직 "이게 정말 우리가 처리할
 * 수 있는 포맷인가"를 변환 시도 전에 값싸게 걸러내는 것.
 */

export type DetectedAudioFormat = "wav" | "m4a";

export class UnsupportedAudioFormatError extends Error {
  constructor() {
    super("지원하지 않는 오디오 형식입니다. (M4A/MP4 계열 또는 WAV만 허용)");
    this.name = "UnsupportedAudioFormatError";
  }
}

/** RIFF....WAVE — 리틀엔디안 RIFF 컨테이너, 4~7바이트는 청크 크기(포맷 판별에 무관). */
function isWav(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  return (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45 // "WAVE"
  );
}

/**
 * ISO Base Media File Format(M4A/MP4/MOV 계열) — 4~7바이트가 "ftyp"인 박스로 시작한다.
 * major brand(8~11바이트, 예: M4A , isom, mp42, qt  )는 기기·인코더마다 달라 화이트리스트로
 * 좁히지 않는다 — "M4A/MP4 계열"을 폭넓게 허용하는 게 doc 03의 의도이고, 실제 디코딩
 * 가능 여부는 뒤이은 ffmpeg 변환 단계가 최종적으로 검증한다(여기서 통과해도 ffmpeg가
 * 거부하면 decode_failed로 처리됨 — AudioConverter.ts 참고).
 */
function isM4aFamily(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // "ftyp"
}

export function detectAudioFormat(bytes: Uint8Array): DetectedAudioFormat {
  if (isWav(bytes)) return "wav";
  if (isM4aFamily(bytes)) return "m4a";
  throw new UnsupportedAudioFormatError();
}
