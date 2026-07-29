/**
 * BioClipProvider.test.ts와 같은 원칙: 전역 fetch를 모킹해 GPU/네트워크 없이 요청 형태·
 * 세그먼트 집계·에러 전파를 검증한다. 실제 CAMP-3 대상 검증은 이 파일의 몫이 아니다(수동으로
 * 확인 완료 — STAGE2_MODEL_SERVICE.md, BirdNetAudioProvider.ts 상단 주석).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BirdNetAudioProvider } from "./BirdNetAudioProvider.js";

function withMockedFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("isConfigured: endpoint가 있으면 true, 없으면 false", () => {
  assert.equal(new BirdNetAudioProvider({ endpoint: "http://127.0.0.1:8932" }).isConfigured(), true);
  assert.equal(new BirdNetAudioProvider({ endpoint: "" }).isConfigured(), false);
});

test("analyze: 요청이 올바른 엔드포인트/메서드/바디로 나간다(토큰 없으면 헤더도 없음)", async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init };
    return new Response(
      JSON.stringify({ model_version: "birdnet-test", quality: {}, segments: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const provider = new BirdNetAudioProvider({ endpoint: "http://127.0.0.1:8932" });
  const wav = Buffer.from("fake-wav-bytes");
  await withMockedFetch(fakeFetch, () => provider.analyze(wav));

  assert.ok(captured, "fetch가 호출되어야 함");
  const c = captured as { url: string; init?: RequestInit };
  assert.equal(c.url, "http://127.0.0.1:8932/internal/audio/analyze");
  assert.equal(c.init?.method, "POST");
  assert.equal((c.init?.headers as Record<string, string>).Authorization, undefined);
  const body = JSON.parse(String(c.init?.body));
  assert.equal(Buffer.from(body.audio_base64, "base64").toString(), "fake-wav-bytes");
});

test("analyze: 토큰이 있으면 Authorization 헤더로 실어 보낸다", async () => {
  let captured: RequestInit | undefined;
  const fakeFetch = (async (_url, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ model_version: "v", quality: {}, segments: [] }), { status: 200 });
  }) as typeof fetch;

  const provider = new BirdNetAudioProvider({ endpoint: "http://127.0.0.1:8932", token: "secret-token" });
  await withMockedFetch(fakeFetch, () => provider.analyze(Buffer.from("x")));

  assert.equal((captured?.headers as Record<string, string>).Authorization, "Bearer secret-token");
});

test("analyze: 여러 세그먼트에 걸친 같은 종은 최고 점수와 그 구간만 남긴다", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        model_version: "birdnet-acoustic-2.4-pb",
        quality: { duration_s: 6, sample_rate: 48000, segment_duration_s: 3 },
        segments: [
          {
            start_s: 0, end_s: 3,
            candidates: [
              { sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.4 },
              { sci_name: "Passer montanus", label: "Eurasian Tree Sparrow", score: 0.1 },
            ],
            embedding: [],
          },
          {
            start_s: 3, end_s: 6,
            candidates: [
              { sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.87 },
              { sci_name: "Pica serica", label: "Korean Magpie", score: 0.2 },
            ],
            embedding: [],
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const provider = new BirdNetAudioProvider({ endpoint: "http://127.0.0.1:8932" });
  const result = await withMockedFetch(fakeFetch, () => provider.analyze(Buffer.from("x")));

  assert.equal(result.modelVersion, "birdnet-acoustic-2.4-pb");
  assert.equal(result.candidates.length, 3, "종 3개(직박구리/참새/까치)로 중복 없이 집계돼야 함");

  const bulbul = result.candidates.find((c) => c.sciName === "Hypsipetes amaurotis");
  assert.equal(bulbul?.score, 0.87, "두 세그먼트 중 더 높은 점수를 남겨야 함");
  assert.equal(bulbul?.startMs, 3000, "최고 점수가 나온 두 번째 세그먼트의 구간이어야 함");
  assert.equal(bulbul?.endMs, 6000);

  // score 내림차순 정렬 확인.
  assert.ok(result.candidates[0]!.score >= result.candidates[1]!.score);
  assert.ok(result.candidates[1]!.score >= result.candidates[2]!.score);
});

test("analyze: HTTP 에러 응답(5xx)이면 명시적으로 throw한다", async () => {
  const fakeFetch = (async () => new Response("internal error", { status: 500 })) as typeof fetch;
  const provider = new BirdNetAudioProvider({ endpoint: "http://127.0.0.1:8932" });
  await assert.rejects(() => withMockedFetch(fakeFetch, () => provider.analyze(Buffer.from("x"))));
});

test("analyze: 네트워크/타임아웃 에러가 나면 그대로 throw한다(게이트웨이가 처리)", async () => {
  const fakeFetch = (async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  }) as typeof fetch;
  const provider = new BirdNetAudioProvider({ endpoint: "http://127.0.0.1:8932", timeoutMs: 1 });
  await assert.rejects(() => withMockedFetch(fakeFetch, () => provider.analyze(Buffer.from("x"))));
});

test("analyze: endpoint 미설정이면 fetch도 안 하고 즉시 throw한다", async () => {
  const provider = new BirdNetAudioProvider({ endpoint: "" });
  await assert.rejects(() => provider.analyze(Buffer.from("x")));
});
