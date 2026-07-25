/**
 * HTTP 인증 인프라 (C단계 — A단계에서 "인증 계층 소관"으로 미뤄뒀던 부분을 이제 만든다).
 *
 * - 비밀번호: node:crypto의 scrypt(표준 라이브러리, 새 의존성 없음)로 해시.
 * - 토큰: 발급/검증 자체는 @fastify/jwt 플러그인(server.ts에서 등록)이 담당한다. 여기서는
 *   그 플러그인이 검증한 결과를 우리 도메인의 AuthContext로 변환하는 preHandler만 둔다.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
// 사이드이펙트 import: @fastify/jwt가 FastifyRequest에 jwtVerify()를 타입 수준으로
// 추가해주는 모듈 확장(declare module "fastify")을 가져오기 위함(server.ts에서 실제 등록).
import "@fastify/jwt";
import type { AuthContext } from "../core/auth/Authorization.js";
import type { UserId } from "../core/domain/types.js";
import type { UserRepository } from "../core/repositories/ports.js";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

/** "<salt-hex>:<hash-hex>" 형식으로 반환 — Credential.passwordHash 에 그대로 저장. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** 상수 시간 비교(timingSafeEqual)로 타이밍 공격을 막는다. 형식이 깨진 저장값은 안전하게 false. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** @fastify/jwt 서명 페이로드. sub 에 UserId 문자열을 담는다. */
export interface JwtPayload {
  sub: string;
}

/** `createAuthenticate()`가 반환하는 preHandler의 타입 — 라우트 등록 함수 시그니처용. */
export type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module "fastify" {
  interface FastifyRequest {
    /** authenticate preHandler 통과 후에만 채워진다. */
    authContext?: AuthContext;
  }
}

/**
 * 인증 preHandler 팩토리. `Authorization: Bearer <token>`의 서명/만료뿐 아니라, 토큰이
 * 가리키는 User가 지금도 실제로 존재하는지까지 확인한 뒤에만 `request.authContext`를
 * 채운다. 실패(누락/위조/만료/계정 삭제됨)하면 401로 요청을 끝낸다.
 *
 * 서명만 검증하고 User 존재 여부를 안 보면, 계정을 삭제(DELETE /account)한 뒤에도 그
 * 이전에 발급된 토큰이 계속 유효한 것처럼 동작해버린다(서명 자체는 여전히 진짜이므로).
 * 이 확인을 개별 라우트 핸들러의 판단에 맡기면(예: 비싼 조회를 피하려고 다들
 * requireAuthContext만 부르는 식으로) 새 라우트를 추가할 때마다 깜빡할 위험이 있으므로,
 * preHandler 한 곳에서 강제한다 — 라우트는 이 preHandler를 통과했다는 사실만으로 계정이
 * 실존한다고 믿을 수 있어야 한다.
 */
export function createAuthenticate(users: UserRepository): AuthenticateHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const payload = await request.jwtVerify<JwtPayload>();
      const userId = payload.sub as UserId;
      const user = await users.get(userId);
      if (!user) {
        reply.code(401).send({ error: "unauthorized", message: "인증이 필요합니다." });
        return;
      }
      request.authContext = { userId };
    } catch {
      reply.code(401).send({ error: "unauthorized", message: "인증이 필요합니다." });
    }
  };
}

/**
 * `authenticate` preHandler를 거친 라우트 핸들러 안에서만 호출할 것. preHandler가 이미
 * 401로 응답을 끝냈다면 Fastify가 핸들러 자체를 실행하지 않으므로, 핸들러 안에서
 * `authContext`가 비어있다는 건 곧 "이 라우트에 preHandler 등록을 깜빡했다"는 뜻이다 —
 * `!` 로 조용히 넘기지 않고 즉시 500으로 터뜨려서 배선 실수를 바로 드러낸다.
 */
export function requireAuthContext(request: FastifyRequest): AuthContext {
  if (!request.authContext) {
    throw new Error("authenticate preHandler를 거치지 않은 라우트에서 authContext 접근");
  }
  return request.authContext;
}
