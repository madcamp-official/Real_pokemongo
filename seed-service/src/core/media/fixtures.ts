/**
 * 미디어 픽스처 (테스트·데모 전용).
 *
 * 정화기의 "미지 포맷 거부" 정책 때문에 더미 바이트([1,2,3])는 쓸 수 없다.
 * 여기서 구조적으로 유효한 최소 JPEG/PNG 를 생성한다. 실제 디코딩 가능한 사진이 아니라
 * **세그먼트/청크 구조가 올바른** 바이트 열이다(정화기는 픽셀을 해석하지 않는다).
 */

function jpegSegment(marker: number, payload: number[]): number[] {
  const len = payload.length + 2; // 길이 필드 자신 포함
  return [0xff, marker, (len >> 8) & 0xff, len & 0xff, ...payload];
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** GPS IFD 포인터(0x8825)와 눈에 띄는 좌표 페이로드가 든 EXIF APP1 페이로드. */
function exifPayloadWithGps(): number[] {
  // "Exif\0\0" + TIFF(리틀엔디언 "II", 42, IFD0@8)
  const exifId = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  // TIFF 본문 구성(오프셋은 TIFF 시작 기준):
  //  0: "II" 2A00  4: IFD0 오프셋(8)
  //  8: IFD0 — 엔트리 1개: 태그 0x8825(GPS IFD), 타입 LONG(4), 카운트 1, 값=GPS IFD 오프셋(26)
  //  8+2+12+4 = 26: GPS IFD — 엔트리 0개 + next(0) + 식별용 좌표 문자열
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, // II, 42
    0x08, 0x00, 0x00, 0x00, // IFD0 @ 8
    0x01, 0x00, // 엔트리 1개
    0x25, 0x88, // 태그 0x8825 (리틀엔디언)
    0x04, 0x00, // 타입 LONG
    0x01, 0x00, 0x00, 0x00, // 카운트 1
    0x1a, 0x00, 0x00, 0x00, // 값 = 26 (GPS IFD 오프셋)
    0x00, 0x00, 0x00, 0x00, // next IFD = 없음
    0x00, 0x00, // GPS IFD 엔트리 0개
    0x00, 0x00, 0x00, 0x00, // GPS next = 없음
    // 식별용 가짜 좌표 바이트(테스트에서 "부재" 검증에 사용).
    ...ascii("GPS37.512345,127.056789"),
  ];
  return [...exifId, ...tiff];
}

/** 최소 구조 JPEG: SOI + APP0(JFIF) + DQT + SOS(엔트로피 약간) + EOI. 메타데이터 없음. */
export function makeCleanJpeg(): Uint8Array {
  const app0 = jpegSegment(0xe0, [...ascii("JFIF"), 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const dqt = jpegSegment(0xdb, [0x00, ...Array(64).fill(0x10)]);
  const sosHeader = jpegSegment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  const entropy = [0x12, 0x34, 0x56, 0x78]; // FF 없는 가짜 데이터
  return Uint8Array.from([0xff, 0xd8, ...app0, ...dqt, ...sosHeader, ...entropy, 0xff, 0xd9]);
}

/** GPS EXIF(APP1) + 주석(COM)이 든 JPEG — 정화 대상 픽스처. */
export function makeJpegWithGpsExif(): Uint8Array {
  const app0 = jpegSegment(0xe0, [...ascii("JFIF"), 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const app1 = jpegSegment(0xe1, exifPayloadWithGps());
  const com = jpegSegment(0xfe, ascii("shot on my phone"));
  const dqt = jpegSegment(0xdb, [0x00, ...Array(64).fill(0x10)]);
  const sosHeader = jpegSegment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  const entropy = [0x12, 0x34, 0x56, 0x78];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...app1, ...com, ...dqt, ...sosHeader, ...entropy, 0xff, 0xd9]);
}

function pngChunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff,
    ...ascii(type),
    ...data,
    0x00, 0x00, 0x00, 0x00, // CRC 자리(정화기는 검증하지 않고 무수정 복사 — 픽스처 단순화)
  ];
}

/** tEXt + eXIf(GPS 포함) 메타데이터가 든 최소 구조 PNG. */
export function makePngWithMetadata(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]); // 1x1 grayscale
  const text = pngChunk("tEXt", ascii("Comment\0taken at home"));
  // eXIf 데이터 = TIFF 바로 시작(위 exifPayloadWithGps 에서 "Exif\0\0" 제외).
  const exif = pngChunk("eXIf", exifPayloadWithGps().slice(6));
  const idat = pngChunk("IDAT", [0x08, 0x1d, 0x01, 0x02, 0x00]);
  const iend = pngChunk("IEND", []);
  return Uint8Array.from([...sig, ...ihdr, ...text, ...exif, ...idat, ...iend]);
}
