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
  assert.equal(body.answer, question);
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
  assert.equal(body.answer, question);
  assert.match(body.safety_warning, /멀리서/);
});

test("POST /professor/ask: 종 이름 없는 일반 질문이 미발견 종과 매칭돼도 설명을 그대로 준다(2026-07-29)", async () => {
  const { server } = await serverPromise;
  const { token } = await signup();
  // "밀잠자리"라는 이름을 넣지 않고도 그 종의 funFact 문장과 거의 같은 표현을 물어, 종 이름 언급/맥락
  // 없이도 검색이 미발견 종에 매칭되는 상황을 재현한다. 예전에는 이 경우 RESTRICTED_ANSWER로 막혔다.
  const question = "성숙한 수컷은 몸에 하얀 가루가 생겨 연한 하늘색처럼 보이는 곤충이 있어?";
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
  assert.equal(body.answer, question);
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
