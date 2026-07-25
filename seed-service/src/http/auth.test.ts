/**
 * hashPassword/verifyPassword 단위테스트. authenticate preHandler(JWT 검증 포함)는
 * 실제 Fastify 인스턴스가 있어야 의미 있게 테스트되므로 라우트 통합테스트에서 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./auth.js";

test("hashPassword/verifyPassword: 정상 비밀번호는 왕복 검증 통과", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("verifyPassword: 틀린 비밀번호는 거부", async () => {
  const hash = await hashPassword("real-password");
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("hashPassword: 같은 비밀번호도 매번 다른 해시(솔트 랜덤)", async () => {
  const h1 = await hashPassword("same-password");
  const h2 = await hashPassword("same-password");
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword("same-password", h1), true);
  assert.equal(await verifyPassword("same-password", h2), true);
});

test("verifyPassword: 형식이 깨진 저장값은 예외 없이 false", async () => {
  assert.equal(await verifyPassword("anything", ""), false);
  assert.equal(await verifyPassword("anything", "not-a-valid-format"), false);
  assert.equal(await verifyPassword("anything", "not:hex:either"), false);
  assert.equal(await verifyPassword("anything", "zz:zz"), false); // hex 아님
});

test("verifyPassword: 빈 비밀번호도 정상 처리(해시 자체는 되되, 다른 값과는 불일치)", async () => {
  const hash = await hashPassword("");
  assert.equal(await verifyPassword("", hash), true);
  assert.equal(await verifyPassword("not-empty", hash), false);
});
