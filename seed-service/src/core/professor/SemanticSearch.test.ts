import test from "node:test";
import assert from "node:assert/strict";
import { detectIntendedField } from "./SemanticSearch.js";

/**
 * 실기기 테스트에서 "까치 뭐 먹어"가 diet로 감지되지 않아 엉뚱한 관찰 포인트
 * 문장("긴 꼬리를 봐요")이 나온 사례(2026-07-30)를 계기로, 아이가 실제로 쓰는
 * 구어체 표현 전반을 점검하고 6개 필드 패턴을 보강했다. 이 테이블은 그때 실패했던
 * 11개 케이스와, 이미 통과하던 케이스들이 함께 깨지지 않는지를 한 번에 검증한다.
 */
const FIELD_CASES: Array<[string, ReturnType<typeof detectIntendedField>]> = [
  // ── 구어체 보강으로 새로 통과해야 하는 케이스 ──────────────────────
  ["까치 뭐 먹어", "diet"],
  ["까치는 뭐 먹어?", "diet"],
  ["까치는 뭐를 먹어?", "diet"],
  ["까치 뭐 먹고 살아?", "diet"],
  ["까치는 어떤 걸 먹어?", "diet"],
  ["까치가 좋아하는 음식은?", "diet"],
  ["까치 집은 어디야?", "habitat"],
  ["까치는 큰 편이야?", "size"],
  ["까치 언제 볼 수 있어?", "activity"],
  ["까치랑 까마귀 어떻게 달라?", "similar"],
  // 라이브 검증 중 발견(2026-07-30): "어떻게 달라"만 잡고 "뭐가 달라/틀려"류
  // 구어체를 놓쳐서, similar 콘텐츠를 채운 뒤에도 필드 자체가 감지 안 돼
  // 엉뚱한 observation 문장으로 새는 사례("큰부리까마귀는 까치랑 뭐가 달라?")가 있었다.
  ["큰부리까마귀는 까치랑 뭐가 달라?", "similar"],
  ["까치랑 물까치 뭐가 틀려?", "similar"],
  ["박새랑 쇠박새 무엇이 다른가요?", "similar"],
  ["까치 어떻게 생겼어?", "observation"],
  // ── 기존에 이미 통과하던 케이스(회귀 금지) ─────────────────────────
  ["까치는 뭘 먹어요?", "diet"],
  ["까치 먹이가 뭐야?", "diet"],
  ["까치 어디 살아", "habitat"],
  ["까치는 어디에서 살아요?", "habitat"],
  ["까치 얼마나 커?", "size"],
  ["까치 어떻게 울어", "sound"],
  ["까치 언제 활동해?", "activity"],
  ["까치랑 물까치 헷갈려", "similar"],
  ["까치 구별하는 법", "observation"],
  ["까치 특징이 뭐야?", "funfact"],
];

test("detectIntendedField: 구어체 표현도 올바른 필드로 감지한다(2026-07-30)", () => {
  for (const [question, expected] of FIELD_CASES) {
    assert.equal(detectIntendedField(question), expected, `question="${question}"`);
  }
});

/**
 * "뭐/뭘 먹"류 구어체는 종 이름과 함께 쓰이면 생태 질문("까치 뭐 먹어?")이지만,
 * 사람의 식사 문맥과 함께 쓰이면("오늘 저녁 뭐 먹지") 도감과 무관한 질문이다.
 * 후자를 diet로 잘못 감지하면 §D의 질문 근거 게이트를 뚫고 들어가 엉뚱한 종의
 * 답을 확신에 차서 내놓게 된다 — 구어체를 넓히면서 가장 주의해야 할 회귀다.
 */
test("detectIntendedField: 사람의 식사 문맥은 diet로 오인하지 않는다(§D 회귀 가드, 2026-07-30)", () => {
  const humanMealQuestions = [
    "오늘 저녁 뭐 먹지",
    "점심 뭐 먹지?",
    "나 오늘 아침 뭐 먹었지",
    "간식 뭐 먹을까",
  ];
  for (const question of humanMealQuestions) {
    assert.equal(detectIntendedField(question), null, `question="${question}"`);
  }
});

test("detectIntendedField: 도메인과 무관한 질문은 여전히 null이다", () => {
  const offTopic = ["1 더하기 1은 뭐야?", "박사님 안녕!", "잠자리는 어떻게 날아?", "나비는 어떻게 애벌레에서 변해?"];
  for (const question of offTopic) {
    assert.equal(detectIntendedField(question), null, `question="${question}"`);
  }
});
