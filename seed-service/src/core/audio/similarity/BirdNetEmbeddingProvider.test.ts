/**
 * BirdNetAudioProvider.test.ts와 같은 원칙 — 전역 fetch를 모킹해 GPU/네트워크 없이 요청 형태/
 * 파싱을 검증한다. 실제 CAMP-3 대상 검증은 이 파일의 몫이 아니다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BirdNetEmbeddingProvider } from "./BirdNetEmbeddingProvider.js";

function withMockedFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("isConfigured: endpoint가 있으면 true, 없으면 false", () => {
  assert.equal(new BirdNetEmbeddingProvider({ endpoint: "http://127.0.0.1:8932" }).isConfigured(), true);
  assert.equal(new BirdNetEmbeddingProvider({ endpoint: "" }).isConfigured(), false);
});

test("embed: /internal/audio/analyze를 부르고 세그먼트별 임베딩+구간(ms)만 뽑아낸다", async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init };
    return new Response(
      JSON.stringify({
        model_version: "birdnet-acoustic-2.4-pb",
        quality: { duration_s: 6, sample_rate: 48000, segment_duration_s: 3 },
        segments: [
          { start_s: 0, end_s: 3, candidates: [], embedding: [0.1, 0.2] },
          { start_s: 3, end_s: 6, candidates: [], embedding: [0.3, 0.4] },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const provider = new BirdNetEmbeddingProvider({ endpoint: "http://127.0.0.1:8932" });
  const result = await withMockedFetch(fakeFetch, () => provider.embed(Buffer.from("x")));

  assert.ok(captured, "fetch가 호출되어야 함");
  const c = captured as { url: string; init?: RequestInit };
  assert.equal(c.url, "http://127.0.0.1:8932/internal/audio/analyze");
  assert.equal(c.init?.method, "POST");

  assert.equal(result.modelVersion, "birdnet-acoustic-2.4-pb");
  assert.equal(result.segments.length, 2);
  assert.deepEqual(result.segments[0], { startMs: 0, endMs: 3000, embedding: [0.1, 0.2] });
  assert.deepEqual(result.segments[1], { startMs: 3000, endMs: 6000, embedding: [0.3, 0.4] });
});

test("embed: 토큰이 있으면 Authorization 헤더로 실어 보낸다", async () => {
  let captured: RequestInit | undefined;
  const fakeFetch = (async (_url, init?: RequestInit) => {
    captured = init;
    return new Response(JSON.stringify({ model_version: "v", segments: [] }), { status: 200 });
  }) as typeof fetch;

  const provider = new BirdNetEmbeddingProvider({ endpoint: "http://127.0.0.1:8932", token: "secret" });
  await withMockedFetch(fakeFetch, () => provider.embed(Buffer.from("x")));

  assert.equal((captured?.headers as Record<string, string>).Authorization, "Bearer secret");
});

test("embed: HTTP 에러 응답이면 명시적으로 throw한다", async () => {
  const fakeFetch = (async () => new Response("internal error", { status: 500 })) as typeof fetch;
  const provider = new BirdNetEmbeddingProvider({ endpoint: "http://127.0.0.1:8932" });
  await assert.rejects(() => withMockedFetch(fakeFetch, () => provider.embed(Buffer.from("x"))));
});

test("embed: 네트워크/타임아웃 에러가 나면 그대로 throw한다(게이트웨이가 처리) — BirdNetAudioProvider와 대칭", async () => {
  const fakeFetch = (async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  }) as typeof fetch;
  const provider = new BirdNetEmbeddingProvider({ endpoint: "http://127.0.0.1:8932", timeoutMs: 1 });
  await assert.rejects(() => withMockedFetch(fakeFetch, () => provider.embed(Buffer.from("x"))));
});

test("embed: endpoint 미설정이면 fetch도 안 하고 즉시 throw한다", async () => {
  const provider = new BirdNetEmbeddingProvider({ endpoint: "" });
  await assert.rejects(() => provider.embed(Buffer.from("x")));
});
