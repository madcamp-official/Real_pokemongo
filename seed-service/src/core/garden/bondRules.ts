/**
 * F9 유대감(Bond) 규칙 — 순수 함수만 모아둔다(I/O 없음, `regionGeneralizer.ts`와 같은 성격).
 *
 * 제품 결정(사용자 확정, 프론트 mock과 동일한 값):
 *  - bond_max = 5
 *  - 재회(reunion) 판정 임계 = 3일
 *  - status_message는 시간/계절 저작 콘텐츠 없이, 상태(재회/최대 유대감/그 외)별 소수
 *    문구 중 결정론적으로 고른다.
 */

export const BOND_MAX = 5;
const REUNION_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 3; // 3일

const STATUS_MESSAGES = [
  "오늘은 기분이 좋아 보여요!",
  "햇살을 쬐며 쉬고 있어요.",
  "주변을 탐험하는 중이에요.",
];
const REUNION_STATUS_MESSAGE = "오랜만이에요! 당신을 기다리고 있었어요.";
const MAX_BOND_STATUS_MESSAGE = "당신을 가장 좋아해요!";

const REACTION_MESSAGES = [
  "기분이 좋아졌어요! 🐾",
  "꼬리를 살랑살랑 흔들어요.",
  "반짝반짝 눈을 빛내요.",
];

/** 문자열을 안정적인 음이 아닌 정수로. 암호학적 목적 아님 — 그저 "같은 개체는 같은 문구"를 위한 결정론적 시드. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 함께한 일수. 음수(시계 오차 등)는 0으로 방어. */
export function daysTogether(createdAtIso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * 재회 판정. 기준 시각은 "마지막 상호작용"이되, 한 번도 상호작용한 적 없으면(개체를 처음
 * 얻고 아직 쓰다듬은 적 없음) 발견 시각(createdAt)을 대신 기준으로 삼는다 — 발견 이후로도
 * 오래 방치했으면 그 역시 "오랜만"이라고 보는 게 자연스럽다.
 */
export function isReunion(
  creature: { createdAt: string; lastInteractionAt?: string },
  now: Date = new Date(),
): boolean {
  const reference = creature.lastInteractionAt ?? creature.createdAt;
  return now.getTime() - new Date(reference).getTime() > REUNION_THRESHOLD_MS;
}

export function statusMessage(creatureId: string, bond: number, reunion: boolean): string {
  if (reunion) return REUNION_STATUS_MESSAGE;
  if (bond >= BOND_MAX) return MAX_BOND_STATUS_MESSAGE;
  return STATUS_MESSAGES[hashString(creatureId) % STATUS_MESSAGES.length]!;
}

/** 상호작용 반응 문구. 같은 개체를 연달아 쓰다듬어도 매번 같은 문구만 나오지 않도록 시각도 섞는다. */
export function reactionMessage(creatureId: string, now: Date = new Date()): string {
  const seed = hashString(creatureId) + Math.floor(now.getTime() / 1000);
  return REACTION_MESSAGES[seed % REACTION_MESSAGES.length]!;
}

export interface InteractionResult {
  bond: number;
  bondLeveledUp: boolean;
  lastInteractionAt: string;
  /** 이번 상호작용 "직전" 기준 재회였는지 — 상호작용으로 재회 상태를 막 해소했다는 뜻. */
  wasReunion: boolean;
}

/** 상호작용(쓰다듬기 등) 1회 적용. Bond는 최대치(BOND_MAX)까지만 오른다. */
export function applyInteraction(
  creature: { bond: number; createdAt: string; lastInteractionAt?: string },
  now: Date = new Date(),
): InteractionResult {
  const wasReunion = isReunion(creature, now);
  const bond = Math.min(creature.bond + 1, BOND_MAX);
  return {
    bond,
    bondLeveledUp: bond > creature.bond,
    lastInteractionAt: now.toISOString(),
    wasReunion,
  };
}
