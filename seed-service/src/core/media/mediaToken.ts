/**
 * F6 사진 갤러리 전용 단기 서명 토큰 (Method A).
 *
 * 배경: React Native `<Image source={{ uri, headers }}>`의 커스텀 헤더가 이 앱의
 * Android/Expo 조합에서 실제로 전달되지 않는 것이 실기기 테스트로 확인됐다(서버 로그에
 * Authorization 헤더 자체가 안 찍힘). `<Image>`는 헤더를 못 붙이지만 URL은 그대로
 * 넘기므로, 로그인 토큰(만료 없음)을 URL에 노출하는 대신 "이 관찰 ID 전용, 짧은 시간만
 * 유효한" 서명된 토큰을 URL 쿼리로 붙인다 — S3 presigned URL과 같은 패턴.
 *
 * observationId를 서명 대상에 포함시켜서, 사진 A용 토큰을 사진 B에 재사용할 수 없다.
 * 소유권 검사는 이 토큰을 "발급하는" 시점(GET /species/:id/photos, 인증 필요)에서
 * 끝난다 — 발급 이후 이 토큰을 "검증하는" 시점(GET /media/:id)은 로그인 여부를 다시
 * 묻지 않고 서명·만료만 확인한다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MEDIA_TOKEN_TTL_SECONDS = 300;

export function signMediaToken(
  observationId: string,
  secret: string,
  now: Date = new Date(),
): string {
  const exp = Math.floor(now.getTime() / 1000) + MEDIA_TOKEN_TTL_SECONDS;
  return `${exp}.${sign(observationId, exp, secret)}`;
}

export function verifyMediaToken(
  token: string,
  observationId: string,
  secret: string,
  now: Date = new Date(),
): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expPart, sigPart] = parts;
  if (!expPart || !sigPart) return false;

  const exp = Number(expPart);
  if (!Number.isFinite(exp)) return false;
  if (exp < Math.floor(now.getTime() / 1000)) return false;

  const expected = Buffer.from(sign(observationId, exp, secret), "hex");
  let actual: Buffer;
  try {
    actual = Buffer.from(sigPart, "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function sign(observationId: string, exp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${observationId}:${exp}`).digest("hex");
}
