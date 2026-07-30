import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../../composition.js";
import { loadConfig } from "../../config/index.js";
import { asTaxonId } from "../../core/domain/ids.js";
import type { UserId } from "../../core/domain/types.js";
import { buildHttpServer } from "../server.js";

function testConfig() {
  const config = loadConfig();
  config.nodeEnv = "test";
  config.database.url = undefined;
  config.identification.plantId.apiKey = undefined;
  config.identification.plantNet.apiKey = undefined;
  config.identification.bioclip.endpoint = "";
  config.mediaStorage.localDir = join(tmpdir(), `seed-professor-test-${randomUUID()}`);
  config.auth.jwtSecret = "professor-test-secret";
  config.professor.embeddingEndpoint = undefined;
  return config;
}

const serverPromise = (async () => {
  const app = await buildApp(testConfig());
  const server = await buildHttpServer(app);
  return { app, server };
})();

async function signup() {
  const { server } = await serverPromise;
  const response = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      email: `${randomUUID()}@professor.test`,
      password: "pw12345",
      nickname: "탐험가",
      avatar: "fox",
      privacy: true,
      location: true,
      photo: true,
      consent_version: "v1",
    },
  });
  const body = response.json();
  return { token: body.access_token as string, userId: body.user.user_id as UserId };
}

test("POST /professor/ask: 인증 없이는 401", async () => {
  const { server } = await serverPromise;
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    payload: { question: "참새는 어디에서 살아요?" },
  });
  assert.equal(response.statusCode, 401);
});

test("POST /professor/ask: 식용 질문은 검색보다 먼저 고정 안전 응답을 낸다", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "이 버섯 삶으면 먹어도 돼?" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.response_source, "fixed_safety");
  assert.equal(body.similarity_score, null);
  assert.match(body.answer, /입에 넣지/);
});

test("POST /professor/ask: 종의 먹이를 묻는 생태 질문은 안전 문구로 막히지 않는다(2026-07-30)", async () => {
  // 예전엔 "먹어" 단어 하나만으로 EDIBILITY_PATTERN이 걸려, 종의 먹이를 묻는
  // 생태 질문까지 전부 "입에 넣지 마세요" 고정 안전 문구로 막혀버렸다.
  const dietQuestions = [
    "까치는 뭘 먹어요?",
    "무당벌레 뭐 먹어?",
    "잠자리는 무엇을 먹어요?",
    "까치는 벌레를 먹어요?",
  ];
  const { server } = await serverPromise;
  const { token } = await signup();
  for (const question of dietQuestions) {
    const response = await server.inject({
      method: "POST",
      url: "/professor/ask",
      headers: { authorization: `Bearer ${token}` },
      payload: { question },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.notEqual(body.response_source, "fixed_safety", `"${question}" 질문이 안전 문구로 막혔다`);
  }
});

test("POST /professor/ask: 사람이 직접 먹어도 되는지 묻는 질문은 계속 안전 문구로 막는다(2026-07-30)", async () => {
  const selfEdibilityQuestions = [
    "이거 먹어도 돼요?",
    "이 버섯 식용인가요?",
    "민들레 먹을 수 있어?",
    "이 열매 먹어도 되나요?",
    "이거 독버섯이야?",
  ];
  const { server } = await serverPromise;
  const { token } = await signup();
  for (const question of selfEdibilityQuestions) {
    const response = await server.inject({
      method: "POST",
      url: "/professor/ask",
      headers: { authorization: `Bearer ${token}` },
      payload: { question },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.response_source, "fixed_safety", `"${question}" 질문이 차단되지 않았다`);
  }
});

test("POST /professor/ask: 직접 이름을 물은 미발견 생물은 답하지만 도감에는 등록하지 않는다", async () => {
  const { app, server } = await serverPromise;
  const { token, userId } = await signup();
  // 질문 자체는 검색 매칭용 원문 라벨 문장(sentence)과 똑같이 써서 해당 레코드로
  // 정확히 매칭되게 하되, 실제로 돌아오는 answer는 라벨이 아니라 조립된 자연어여야 한다.
  const question = "참새 관찰 장소: 우리 동네, 공원, 들판.";
  const before = await app.repos.collection.listByUser(userId);
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question, context_species_id: "taxon-passer-montanus" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.restricted, false);
  assert.notEqual(body.answer, question, "answer가 검색용 라벨 문장을 그대로 반환하면 안 된다");
  assert.doesNotMatch(body.answer, /관찰 장소:/, "answer에 라벨 콜론 표기가 남아있으면 안 된다");
  assert.match(body.answer, /참새는 주로.*지내요/);
  assert.match(body.answer, /우리 동네/);
  assert.equal(body.matched_species.name, "참새");
  assert.equal(body.matched_species.discovered, false);
  assert.deepEqual(await app.repos.collection.listByUser(userId), before);
});

test("POST /professor/ask: 자연어 질문의 종명을 우선해 같은 속 생물을 혼동하지 않는다", async () => {
  const { app, server } = await serverPromise;
  const { token, userId } = await signup();
  const before = await app.repos.collection.listByUser(userId);
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "무당벌레의 크기는 어떻게 돼?" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.restricted, false, JSON.stringify(body));
  assert.equal(body.matched_species.name, "무당벌레");
  assert.equal(body.matched_species.discovered, false);
  assert.match(body.answer, /7~8mm/);
  assert.deepEqual(await app.repos.collection.listByUser(userId), before);
});

test("POST /professor/ask: 미발견 위험 종도 안전 문장과 종명은 공개한다", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  const question = "양봉꿀벌: 쏘이거나 물릴 수 있어요. 가까이 가지 말고 멀리서 봐요.";
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question, context_species_id: "taxon-honeybee" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.restricted, false);
  assert.equal(body.matched_species.name, "양봉꿀벌");
  assert.equal(body.matched_species.discovered, false);
  assert.notEqual(body.answer, question, "answer가 검색용 라벨 문장을 그대로 반환하면 안 된다");
  assert.match(body.answer, /양봉꿀벌은 쏘이거나 물릴 수 있어요/);
  assert.match(body.safety_warning, /멀리서/);
});

test("POST /professor/ask: 종 이름 없는 일반 질문이 미발견 종과 매칭돼도 설명을 그대로 준다(2026-07-29)", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  // "밀잠자리"라는 이름을 넣지 않고도 그 종의 funFact 문장과 거의 같은 표현을 물어, 종 이름 언급/맥락
  // 없이도 검색이 미발견 종에 매칭되는 상황을 재현한다. 예전에는 이 경우 RESTRICTED_ANSWER로 막혔다.
  // "특징이 뭐야"는 §D의 질문 근거 게이트(종 이름/문맥/필드 패턴 중 하나는 있어야 검색한다)를
  // 통과시키는 자연스러운 표현이다 — 종 이름 없이도 "이런 게 궁금하다"는 최소한의 단서는 있다.
  const question = "성숙한 수컷은 몸에 하얀 가루가 생겨 연한 하늘색처럼 보이는 곤충의 특징이 뭐야?";
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.restricted, false, JSON.stringify(body));
  assert.equal(body.matched_species.name, "밀잠자리");
  assert.equal(body.matched_species.discovered, false);
  assert.match(body.answer, /하늘색/);
});

test("POST /professor/ask: 종 이름·문맥·필드 패턴 중 아무 근거도 없는 질문은 점수와 무관하게 모른다고 답한다(2026-07-30)", async () => {
  // §D: 절대 유사도 점수는 이 임베딩 모델에서 신뢰할 수 없다(전혀 무관한 질문·문장 쌍도
  // 0.7~0.87까지 나올 수 있음을 실제로 확인했다). 종 이름/문맥/필드 패턴 중 아무 근거도
  // 없는 질문은 검색 점수를 보지도 않고 곧장 모른다고 답해야 한다.
  const unanchoredQuestions = [
    "오늘 저녁 뭐 먹지",
    "잠자리는 어떻게 날아?",
    "나비는 어떻게 애벌레에서 변해?",
    "1 더하기 1은 뭐야?",
  ];
  const { server } = await serverPromise;
  const { token } = await signup();
  for (const question of unanchoredQuestions) {
    const response = await server.inject({
      method: "POST",
      url: "/professor/ask",
      headers: { authorization: `Bearer ${token}` },
      payload: { question },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.response_source, "unknown", `"${question}" 질문이 근거 없이 답변으로 새어나갔다: ${JSON.stringify(body)}`);
    assert.equal(body.matched_species, null);
    assert.equal(body.similarity_score, null, "근거 없는 질문은 검색 자체를 하지 않아 점수가 없어야 한다");
  }
});

test("POST /professor/ask: 인사·작별·감사·정체성 같은 잡담에는 모른다 대신 친근한 고정 답을 한다(2026-07-30)", async () => {
  // "박사님 안녕!"처럼 종 이름도 필드 패턴도 없는 질문은 전부 UNKNOWN_ANSWER로
  // 뭉뚱그려져, 친근한 도감 박사가 인사에도 "모르겠다"고 답하는 것처럼 보였다.
  const cases: Array<[string, RegExp]> = [
    ["박사님 안녕!", /안녕하세요/],
    ["안녕하세요", /안녕하세요/],
    ["고마워요 박사님", /천만에요/],
    ["잘 가!", /다음에 또 만나요/],
    ["박사님은 누구야?", /도감의 박사/],
    ["너는 누구야?", /도감의 박사/],
  ];
  const { server } = await serverPromise;
  const { token } = await signup();
  for (const [question, expectedAnswer] of cases) {
    const response = await server.inject({
      method: "POST",
      url: "/professor/ask",
      headers: { authorization: `Bearer ${token}` },
      payload: { question },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.response_source, "small_talk", `question="${question}" body=${JSON.stringify(body)}`);
    assert.equal(body.matched_species, null);
    assert.equal(body.safety_warning, null);
    assert.equal(body.similarity_score, null);
    assert.match(body.answer, expectedAnswer, `question="${question}" answer="${body.answer}"`);
  }
});

test("POST /professor/ask: 인사말 뒤에 진짜 질문이 붙으면 인사로 뭉개지 않고 그 질문에 답한다(2026-07-30)", async () => {
  // 종 이름이 문장에 있으면 이미 hasQuestionAnchor가 참이 되어, 잡담 감지 분기까지
  // 가지 않고 정상적으로 검색해서 답해야 한다 — 인사말이 실제 질문을 가리면 안 된다.
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "안녕하세요 박사님! 까치는 뭐 먹어요?" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.notEqual(body.response_source, "small_talk", JSON.stringify(body));
  assert.equal(body.matched_species?.name, "까치", JSON.stringify(body));
  assert.match(body.answer, /먹는|잡식/);
});

test("POST /professor/ask: 종 이름이 없어도 필드 패턴(계절/크기 등)이 있으면 검색으로 답한다(2026-07-30)", async () => {
  // 종 이름이 없어도 "계절"처럼 알려진 필드 패턴에 걸리면 §D 게이트를 통과해 정상 검색한다
  // — 실제로 도감 박사 화면의 기본 추천 질문("지금 계절에는 어떤 친구를 관찰하기 좋아?")이
  // 바로 이 형태라, 게이트가 이 흐름 자체를 막지 않는지 확인한다.
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "지금 계절에는 어떤 친구를 관찰하기 좋아?" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.notEqual(body.response_source, "unknown", JSON.stringify(body));
  assert.ok(body.matched_species, JSON.stringify(body));
});

test("POST /professor/ask: 종 이름·필드 패턴이 없어도 context_species_id가 있으면 검색으로 답한다(2026-07-30)", async () => {
  // 종 카드 화면 등에서 이미 종이 정해진 채로 애매한 질문("이 친구는 뭐가 특별해?")을
  // 던지는 흐름을 재현한다 — context_species_id 자체가 §D의 유효한 질문 근거여야 한다.
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "이 친구 우리 동네에서도 보여?", context_species_id: "taxon-pica-serica" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.notEqual(body.response_source, "unknown", JSON.stringify(body));
  assert.equal(body.matched_species.name, "까치");
});

test("POST /professor/ask: 필드가 감지되면 같은 종의 다른 필드 문장에 밀리지 않는다(2026-07-30)", async () => {
  // 실제 임베딩 워커로 확인했을 때, "서양민들레는 뭘 먹어요?"가 fieldBoost(+0.18)를
  // 주고도 diet 대신 observation(꽃잎을 세어봐요)과 매칭되는 문제가 있었다.
  // detectIntendedField가 diet를 감지하면 diet 문장만 후보로 남기도록 고쳤다.
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "서양민들레는 뭘 먹어요?", context_species_id: "taxon-dandelion" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.matched_species.name, "서양민들레");
  assert.match(body.answer, /양분/, JSON.stringify(body));
  assert.doesNotMatch(body.answer, /꽃잎을 세어봐요/, "observation 문장에 밀리면 안 된다");
});

test("POST /professor/ask: 구어체로 물어도(종 이름은 문장 안에 있음) 정확한 필드로 답한다(2026-07-30)", async () => {
  // 실기기 테스트에서 실제로 재현된 사례: "까치 뭐 먹어"에 "까치를 관찰할 때는
  // 긴 꼬리를 봐요"라는 엉뚱한 답이 나왔다. "뭐 먹"이 diet 패턴에 없어
  // detectIntendedField가 null을 반환했고(§D 게이트는 종 이름으로 통과했지만),
  // §재순위 하드 필터가 발동하지 않아 순수 유사도 1등(observation)이 이겨버린
  // 것이었다. context_species_id 없이 "종 이름 + 구어체"만으로 재현한다.
  const colloquialQuestions: Array<[string, RegExp]> = [
    ["까치 뭐 먹어", /먹는|잡식/],
    ["까치는 뭐를 먹어?", /먹는|잡식/],
    ["까치는 큰 편이야?", /몸길이/],
    ["까치 언제 볼 수 있어?", /움직여요/],
  ];
  const { server } = await serverPromise;
  const { token } = await signup();
  for (const [question, expectedAnswer] of colloquialQuestions) {
    const response = await server.inject({
      method: "POST",
      url: "/professor/ask",
      headers: { authorization: `Bearer ${token}` },
      payload: { question },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.matched_species?.name, "까치", `question="${question}" body=${JSON.stringify(body)}`);
    assert.match(body.answer, expectedAnswer, `question="${question}" answer="${body.answer}"`);
    assert.doesNotMatch(
      body.answer,
      /긴 꼬리를 봐요/,
      `question="${question}" observation 문장에 밀리면 안 된다`,
    );
  }
});

test("POST /professor/ask: 자주 헷갈리는 새 4쌍을 물으면 관찰 포인트가 아니라 비교 답변을 낸다(2026-07-30)", async () => {
  // "까치랑 까마귀 어떻게 달라?"에 "긴 꼬리를 봐요"(observation)가 나왔던 라이브 버그의
  // 근본 원인은 similar 필드 감지가 아니라 콘텐츠 자체의 부재였다(까치에 similar
  // 문장이 아예 없었음). seedData.ts에 조류 4쌍을 수작업으로 채운 뒤, 실제로 비교
  // 내용이 담긴 답변이 나오는지 확인한다.
  const cases: Array<[string, string, RegExp, RegExp]> = [
    // [질문, 기대 matched_species, 답변에 있어야 할 패턴, 있으면 안 되는(다른 종 혼동) 패턴]
    // 까치는 similar 문장이 2개(vs 큰부리까마귀, vs 물까치)라 테스트 전용 해시
    // 임베딩으로는 어느 쪽이 이길지 결정론적이지 않다(실제 GPU 임베딩으로는 별도
    // 라이브 검증에서 확인함) — 여기서는 "둘 중 하나의 진짜 비교 문장"이 나오고
    // 원래 버그였던 observation 폴백("긴 꼬리를 봐요")으로 새지 않는지만 검증한다.
    ["까치랑 까마귀 어떻게 달라?", "까치", /까마귀|물까치/, /긴 꼬리를 봐요/],
    ["까치는 물까치랑 헷갈려", "물까치", /까치/, /긴 꼬리를 봐요/],
    // "어떻게 달라"가 아니라 "뭐가 달라"류 구어체 — 라이브 검증 중 발견한 별도
    // 회귀(2026-07-30): 이 표현이 similar 패턴에 없어 필드 하드 필터가 아예
    // 발동하지 않고 observation 문장("온몸이 까만 깃털을 봐요")으로 샜었다.
    ["큰부리까마귀는 까치랑 뭐가 달라?", "큰부리까마귀", /까치/, /까만 깃털/],
    ["박새는 다른 새랑 어떻게 달라?", "박새", /쇠박새/, /참새|딱새/],
    ["쇠박새는 뭐랑 헷갈려?", "쇠박새", /박새/, /참새|딱새/],
    ["참새는 다른 새랑 어떻게 달라?", "참새", /딱새/, /박새|쇠박새/],
    ["딱새는 뭐랑 헷갈려?", "딱새", /참새/, /박새|쇠박새/],
  ];
  const { server } = await serverPromise;
  const { token } = await signup();
  for (const [question, expectedSpecies, mustMatch, mustNotMatch] of cases) {
    const response = await server.inject({
      method: "POST",
      url: "/professor/ask",
      headers: { authorization: `Bearer ${token}` },
      payload: { question },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(
      body.matched_species?.name,
      expectedSpecies,
      `question="${question}" body=${JSON.stringify(body)}`,
    );
    assert.match(body.answer, mustMatch, `question="${question}" answer="${body.answer}"`);
    assert.doesNotMatch(body.answer, mustNotMatch, `question="${question}" answer="${body.answer}"`);
    assert.doesNotMatch(
      body.answer,
      /긴 꼬리를 봐요/,
      `question="${question}" observation 폴백으로 밀리면 안 된다`,
    );
  }
});

test("POST /professor/ask: 감지된 필드에 해당 종의 문장이 없으면 안전하게 다른 문장으로 폴백한다(2026-07-30)", async () => {
  // 서양민들레에는 sound(소리) 문장이 없다 — 하드 필터 결과가 비어서 아예
  // "모른다"로 새어버리면 안 된다. 필터링 전 후보군(같은 종의 다른 문장)으로
  // 안전하게 되돌아가 무엇이든 답해야 한다.
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "서양민들레는 어떤 소리를 내요?", context_species_id: "taxon-dandelion" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.notEqual(body.response_source, "unknown", JSON.stringify(body));
  assert.equal(body.matched_species.name, "서양민들레");
});

test("POST /professor/ask: 계절을 콕 집어 말하지 않은 계절 질문은 지금 계절(여름)로 답한다(2026-07-30)", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "지금 계절에는 어떤 친구를 관찰하기 좋아?" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.notEqual(body.response_source, "unknown", JSON.stringify(body));
  assert.match(body.answer, /여름/, JSON.stringify(body));
});

test("POST /professor/ask: 특정 계절을 콕 집어 물으면 지금 계절(여름) 대신 그 계절을 존중한다(2026-07-30)", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "소나무는 겨울에도 볼 수 있어?", context_species_id: "taxon-pinus-densiflora" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.matched_species.name, "소나무");
  assert.match(body.answer, /겨울/, JSON.stringify(body));
});

test("POST /professor/ask: 종은 정해졌지만 그 종에 지금 계절(여름) 정보가 없으면 안전하게 폴백한다(2026-07-30)", async () => {
  // 소나무는 겨울에만 등장하는 계절 문장을 갖고 있다. "몇 월에 볼 수 있어요?"는
  // 특정 계절을 콕 집지 않았으니 여름을 우선하지만, 소나무에는 여름 문장이 없으므로
  // 필터링 결과가 비어 폴백해 겨울 문장이라도 정상적으로 돌아와야 한다.
  const { server } = await serverPromise;
  const { token } = await signup();
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "소나무는 몇 월에 볼 수 있어요?", context_species_id: "taxon-pinus-densiflora" },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.notEqual(body.response_source, "unknown", JSON.stringify(body));
  assert.equal(body.matched_species.name, "소나무");
  assert.match(body.answer, /겨울/, JSON.stringify(body));
});

test("POST /professor/ask: 발견 종은 인덱스 원문과 종 카드 링크 정보를 반환한다", async () => {
  const { app, server } = await serverPromise;
  const { token, userId } = await signup();
  const taxonId = asTaxonId("taxon-dandelion");
  await app.repos.collection.save({
    userId,
    taxonId,
    unlocked: true,
    timesObserved: 1,
  });
  const question = "서양민들레 크기: 키가 10~25cm 정도 돼요.";
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question, context_species_id: taxonId },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.restricted, false, JSON.stringify(body));
  assert.notEqual(body.answer, question, "answer가 검색용 라벨 문장을 그대로 반환하면 안 된다");
  assert.match(body.answer, /서양민들레는 키가 10~25cm 정도 돼요/);
  assert.equal(body.matched_species.species_id, taxonId);
  assert.equal(body.matched_species.discovered, true);
});

test("POST /professor/ask: 질문은 도감 상태를 변경하지 않는다", async () => {
  const { app, server } = await serverPromise;
  const { token, userId } = await signup();
  const before = await app.repos.collection.listByUser(userId);
  const response = await server.inject({
    method: "POST",
    url: "/professor/ask",
    headers: { authorization: `Bearer ${token}` },
    payload: { question: "참새는 언제 활동해?" },
  });
  assert.equal(response.statusCode, 200);
  const after = await app.repos.collection.listByUser(userId);
  assert.deepEqual(after, before);
});

test("GET /professor/greeting, suggestions: 질문 원문 없이 진행도 기반 응답", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  const headers = { authorization: `Bearer ${token}` };
  const [greeting, suggestions] = await Promise.all([
    server.inject({ method: "GET", url: "/professor/greeting", headers }),
    server.inject({ method: "GET", url: "/professor/suggestions", headers }),
  ]);
  assert.equal(greeting.statusCode, 200);
  assert.equal(greeting.json().discovered_count, 0);
  assert.equal(suggestions.statusCode, 200);
  assert.ok(Array.isArray(suggestions.json()));
  assert.ok(suggestions.json().length >= 2);
});

test("GET /professor/suggestions: 발견한 종 이름에 맞는 조사(은/는)를 붙인다(2026-07-29)", async () => {
  const { app, server } = await serverPromise;
  const { token, userId } = await signup();
  // "까치"는 받침 없는 이름이라 "는"이 맞다 — 예전엔 "은"이 하드코딩돼 "까치은"이라는 비문이 나왔다.
  await app.repos.collection.save({
    userId,
    taxonId: asTaxonId("taxon-pica-serica"),
    unlocked: true,
    timesObserved: 1,
  });
  const response = await server.inject({
    method: "GET",
    url: "/professor/suggestions",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 200);
  const magpieSuggestion = (response.json() as Array<{ context_species_id?: string; question: string }>)
    .find((suggestion) => suggestion.context_species_id === "taxon-pica-serica");
  assert.ok(magpieSuggestion, JSON.stringify(response.json()));
  assert.equal(magpieSuggestion.question, "까치는 어디에서 살아요?");
});
