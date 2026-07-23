/**
 * 미디어 정화기 (체크리스트 §1.4 [치명] — EXIF GPS 제거).
 *
 * 우리는 Observation 스키마에서 좌표를 뺐지만, 스마트폰 사진 파일(EXIF)에는 촬영 위치
 * GPS가 박혀 있다. 이 모듈은 이미지가 **저장되거나 외부(동정 API 등)로 전송되기 전에**
 * 메타데이터를 바이너리 수준에서 제거한다. 픽셀 데이터는 건드리지 않는다(재인코딩 없음).
 *
 * 강제 방식 — 기존 패턴(AuthContext, 좌표 없는 Observation)과 동일한 브랜디드 타입:
 * `SanitizedImage` 는 이 모듈의 sanitizeImage() 만이 생성할 수 있고, 동정 게이트웨이는
 * SanitizedImage 만 받는다. **정화를 거치지 않은 원시 바이트를 외부로 보내는 코드는
 * 컴파일되지 않는다.**
 *
 * 보수 정책(안전 필터와 같은 '거짓 음성 금지' 철학): 알 수 없는 포맷은 통과시키지 않고
 * 거부한다 — 통과시키면 미지의 메타데이터가 새어 나갈 수 있기 때문이다.
 *
 * 외부 의존성 0 (순수 바이너리 파싱).
 */

/** 정화 완료 이미지. 이 모듈 밖에서 생성할 수 없다. */
export type SanitizedImage = Uint8Array & { readonly __sanitized: "SanitizedImage" };

export class UnsupportedImageFormatError extends Error {
  constructor() {
    super(
      "지원하지 않는 이미지 형식입니다. (메타데이터 누출 방지를 위해 JPEG/PNG 외에는 거부)",
    );
    this.name = "UnsupportedImageFormatError";
  }
}

export interface SanitizeReport {
  format: "jpeg" | "png";
  /** 제거된 메타데이터 세그먼트/청크 수. */
  removedSegments: number;
  /**
   * 제거된 EXIF 안에 GPS IFD(위치 정보)가 있었는지. **값 자체는 어디에도 저장하지 않고**
   * 존재 여부만 보고한다(관측/테스트용 — 좌표를 로그에 남기지 말 것, 체크리스트 §1.7).
   */
  hadGps: boolean;
}

export interface SanitizeResult {
  image: SanitizedImage;
  report: SanitizeReport;
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

export function sanitizeImage(bytes: Uint8Array): SanitizeResult {
  if (isJpeg(bytes)) return sanitizeJpeg(bytes);
  if (isPng(bytes)) return sanitizePng(bytes);
  throw new UnsupportedImageFormatError();
}

/** 여러 장 일괄 정화. 하나라도 미지 포맷이면 전체 거부(부분 통과 없음). */
export function sanitizeImages(images: Uint8Array[]): {
  images: SanitizedImage[];
  reports: SanitizeReport[];
} {
  const results = images.map((b) => sanitizeImage(b));
  return {
    images: results.map((r) => r.image),
    reports: results.map((r) => r.report),
  };
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------
// 구조: FFD8(SOI) 이후 세그먼트 나열. 각 세그먼트 = FF 마커(1) + 길이(2, 길이 자신 포함).
// 길이가 없는 단독 마커: SOI(D8), EOI(D9), RST0~7(D0~D7), TEM(01).
// SOS(FFDA) 이후는 엔트로피 코딩 데이터 → 원본 그대로 복사(픽셀 불변).
//
// 제거: APP1~APP15(FFE1~FFEF: EXIF/XMP/ICC 주석 등), COM(FFFE: 주석).
// 유지: APP0(FFE0: JFIF), DQT/SOF/DHT 등 디코딩에 필요한 구조 세그먼트 전부.

function isJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function sanitizeJpeg(bytes: Uint8Array): SanitizeResult {
  const out: number[] = [0xff, 0xd8]; // SOI
  let removedSegments = 0;
  let hadGps = false;

  let i = 2;
  while (i < bytes.length) {
    // 마커 정렬: FF 로 시작해야 함. 아니면 손상 — 남은 바이트를 그대로 복사하고 종료.
    if (bytes[i] !== 0xff) {
      for (; i < bytes.length; i++) out.push(bytes[i]!);
      break;
    }
    const marker = bytes[i + 1];
    if (marker === undefined) break;

    // EOI: 그대로 쓰고 종료.
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      i += 2;
      break;
    }

    // SOS: 헤더 + 이후 전체(엔트로피 데이터~EOI)를 그대로 복사. 픽셀은 절대 불변.
    if (marker === 0xda) {
      for (; i < bytes.length; i++) out.push(bytes[i]!);
      break;
    }

    // 길이 없는 단독 마커(SOI/RST/TEM): 그대로 복사.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }

    // 길이 있는 세그먼트.
    const lenHi = bytes[i + 2];
    const lenLo = bytes[i + 3];
    if (lenHi === undefined || lenLo === undefined) break; // 손상 꼬리 — 중단
    const segLen = (lenHi << 8) | lenLo; // 길이 필드 자신 포함
    const segEnd = i + 2 + segLen;

    const isApp1to15 = marker >= 0xe1 && marker <= 0xef;
    const isCom = marker === 0xfe;

    if (isApp1to15 || isCom) {
      // 메타데이터 세그먼트 — 제거.
      removedSegments++;
      if (marker === 0xe1) {
        // APP1(EXIF)이면 GPS IFD 존재 여부만 감지(보고용).
        const payload = bytes.subarray(i + 4, Math.min(segEnd, bytes.length));
        if (exifHasGps(payload)) hadGps = true;
      }
    } else {
      // 구조 세그먼트(APP0/DQT/SOF/DHT 등) — 유지.
      for (let j = i; j < Math.min(segEnd, bytes.length); j++) out.push(bytes[j]!);
    }
    i = segEnd;
  }

  return {
    image: Uint8Array.from(out) as SanitizedImage,
    report: { format: "jpeg", removedSegments, hadGps },
  };
}

/**
 * APP1 페이로드("Exif\0\0" + TIFF)에서 GPS IFD 포인터(태그 0x8825)의 존재를 감지.
 * 파싱 실패는 false 로 처리 — 어차피 세그먼트 전체가 제거되므로(제거가 본질, 감지는 보고용).
 */
function exifHasGps(payload: Uint8Array): boolean {
  try {
    // "Exif\0\0" 식별자 확인.
    const id = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    if (payload.length < 14) return false;
    for (let k = 0; k < id.length; k++) if (payload[k] !== id[k]) return false;

    const tiff = payload.subarray(6);
    const little = tiff[0] === 0x49 && tiff[1] === 0x49; // "II"
    const big = tiff[0] === 0x4d && tiff[1] === 0x4d; // "MM"
    if (!little && !big) return false;
    const u16 = (o: number) =>
      little ? tiff[o]! | (tiff[o + 1]! << 8) : (tiff[o]! << 8) | tiff[o + 1]!;
    const u32 = (o: number) =>
      little
        ? tiff[o]! | (tiff[o + 1]! << 8) | (tiff[o + 2]! << 16) | (tiff[o + 3]! << 24)
        : (tiff[o]! << 24) | (tiff[o + 1]! << 16) | (tiff[o + 2]! << 8) | tiff[o + 3]!;

    if (u16(2) !== 42) return false; // TIFF 매직
    const ifd0 = u32(4);
    if (ifd0 + 2 > tiff.length) return false;
    const entryCount = u16(ifd0);
    for (let e = 0; e < entryCount; e++) {
      const entryOff = ifd0 + 2 + e * 12;
      if (entryOff + 12 > tiff.length) return false;
      const tag = u16(entryOff);
      if (tag === 0x8825) return true; // GPS Info IFD 포인터
    }
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------
// 구조: 8바이트 시그니처 + 청크 나열. 청크 = 길이(4 BE) + 타입(4 ascii) + 데이터 + CRC(4).
// 제거: eXIf(EXIF — GPS 포함 가능), tEXt/zTXt/iTXt(텍스트 메타데이터 — 위치·기기정보 기록 관행).
// 유지: IHDR/PLTE/IDAT/IEND 등 나머지 전부(무수정 복사라 CRC 그대로 유효).

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_STRIP_TYPES = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function isPng(b: Uint8Array): boolean {
  if (b.length < PNG_SIG.length) return false;
  return PNG_SIG.every((v, idx) => b[idx] === v);
}

function sanitizePng(bytes: Uint8Array): SanitizeResult {
  const out: number[] = [...PNG_SIG];
  let removedSegments = 0;
  let hadGps = false;

  let i = PNG_SIG.length;
  while (i + 8 <= bytes.length) {
    const dataLen =
      (bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!;
    const type = String.fromCharCode(
      bytes[i + 4]!,
      bytes[i + 5]!,
      bytes[i + 6]!,
      bytes[i + 7]!,
    );
    const chunkEnd = i + 8 + dataLen + 4; // 길이+타입+데이터+CRC
    if (dataLen < 0 || chunkEnd > bytes.length) break; // 손상 — 중단

    if (PNG_STRIP_TYPES.has(type)) {
      removedSegments++;
      if (type === "eXIf") {
        // eXIf 청크 데이터는 TIFF 구조(JPEG 의 "Exif\0\0" 없이 바로 TIFF).
        const tiffLike = new Uint8Array(6 + dataLen);
        tiffLike.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
        tiffLike.set(bytes.subarray(i + 8, i + 8 + dataLen), 6);
        if (exifHasGps(tiffLike)) hadGps = true;
      }
    } else {
      for (let j = i; j < chunkEnd; j++) out.push(bytes[j]!);
    }

    i = chunkEnd;
    if (type === "IEND") break;
  }

  return {
    image: Uint8Array.from(out) as SanitizedImage,
    report: { format: "png", removedSegments, hadGps },
  };
}
