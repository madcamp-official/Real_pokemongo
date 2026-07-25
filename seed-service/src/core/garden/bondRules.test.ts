import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOND_MAX,
  daysTogether,
  isReunion,
  statusMessage,
  reactionMessage,
  applyInteraction,
} from "./bondRules.js";

const DAY_MS = 1000 * 60 * 60 * 24;

test("daysTogether: 경과일 계산, 음수는 0으로 방어", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  assert.equal(daysTogether(new Date(now.getTime() - 5 * DAY_MS).toISOString(), now), 5);
  assert.equal(daysTogether(now.toISOString(), now), 0);
  // 미래 시각(시계 오차 등)이 와도 음수가 아니라 0.
  assert.equal(daysTogether(new Date(now.getTime() + DAY_MS).toISOString(), now), 0);
});

test("isReunion: 마지막 상호작용 후 3일 이내면 재회 아님, 넘으면 재회", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const creature = { createdAt: now.toISOString(), lastInteractionAt: new Date(now.getTime() - 2 * DAY_MS).toISOString() };
  assert.equal(isReunion(creature, now), false);

  const longAgo = { createdAt: now.toISOString(), lastInteractionAt: new Date(now.getTime() - 4 * DAY_MS).toISOString() };
  assert.equal(isReunion(longAgo, now), true);
});

test("isReunion: 한 번도 상호작용 안 했으면 발견 시각(createdAt)을 기준으로 삼는다", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const justFound = { createdAt: new Date(now.getTime() - DAY_MS).toISOString() };
  assert.equal(isReunion(justFound, now), false, "발견한 지 3일이 안 됐으면 재회 아님");

  const foundLongAgo = { createdAt: new Date(now.getTime() - 10 * DAY_MS).toISOString() };
  assert.equal(isReunion(foundLongAgo, now), true, "발견 이후로도 오래 방치하면 재회");
});

test("statusMessage: 재회면 재회 문구, 최대 유대감이면 전용 문구, 그 외엔 소수 문구 중 결정론적 선택", () => {
  assert.match(statusMessage("cr_1", 3, true), /오랜만/);
  assert.match(statusMessage("cr_1", BOND_MAX, false), /가장 좋아해요/);
  // 재회도 최대치도 아니면 두 전용 문구가 아닌 값이 나오고, 같은 입력엔 항상 같은 값(결정론적).
  const a = statusMessage("cr_1", 2, false);
  const b = statusMessage("cr_1", 2, false);
  assert.equal(a, b);
  assert.doesNotMatch(a, /오랜만|가장 좋아해요/);
});

test("reactionMessage: 항상 정의된 문구 중 하나를 반환한다", () => {
  const msg = reactionMessage("cr_1", new Date("2026-07-20T00:00:00.000Z"));
  assert.ok(msg.length > 0);
});

test("applyInteraction: bond는 1 증가하되 BOND_MAX를 넘지 않는다", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const r1 = applyInteraction({ bond: 2, createdAt: now.toISOString() }, now);
  assert.equal(r1.bond, 3);
  assert.equal(r1.bondLeveledUp, true);

  const r2 = applyInteraction({ bond: BOND_MAX, createdAt: now.toISOString() }, now);
  assert.equal(r2.bond, BOND_MAX);
  assert.equal(r2.bondLeveledUp, false, "이미 최대치면 더 안 오르고, 레벨업도 아님");
});

test("applyInteraction: wasReunion은 상호작용 '직전' 상태를 반영한다(상호작용으로 재회를 막 해소)", () => {
  const now = new Date("2026-07-20T00:00:00.000Z");
  const longAbsent = {
    bond: 1,
    createdAt: new Date(now.getTime() - 10 * DAY_MS).toISOString(),
    lastInteractionAt: new Date(now.getTime() - 5 * DAY_MS).toISOString(),
  };
  const result = applyInteraction(longAbsent, now);
  assert.equal(result.wasReunion, true);
  assert.equal(result.lastInteractionAt, now.toISOString());
});
