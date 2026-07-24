/**
 * BioClipProvider: 전역 fetch를 모킹해 GPU/네트워크 없이 요청 바디 형태, 응답 정규화,
 * 에러 전파를 검증한다. 실제 GPU 서버 대상 통합 검증은 이 파일의 몫이 아니다(수동 검증
 * 별도 진행, INFERENCE_SERVER_STATUS.md 참고).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BioClipProvider } from "./BioClipProvider.js";
import { sanitizeImage } from "../../media/MediaSanitizer.js";
import { makeCleanJpeg } from "../../media/fixtures.js";
import { classifyConfidence } from "../confidencePolicy.js";

const IMG = [sanitizeImage(makeCleanJpeg()).image];

function withMockedFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("isConfigured: endpoint가 있으면 true, 없으면 false", () => {
  assert.equal(new BioClipProvider({ endpoint: "http://127.0.0.1:8931" }).isConfigured(), true);
  assert.equal(new BioClipProvider({ endpoint: "" }).isConfigured(), false);
});

test("identify: 요청이 올바른 엔드포인트/메서드/바디 형태로 나간다", async () => {
  let captured: { url: string; init?: RequestInit } | null = null;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init };
    return new Response(
      JSON.stringify({ closed_full_ranking: [], final_tier: "unknown" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  const provider = new BioClipProvider({ endpoint: "http://127.0.0.1:8931" });
  await withMockedFetch(fakeFetch, () => provider.identify({ images: IMG }));

  assert.ok(captured, "fetch가 호출되어야 함");
  const c = captured as { url: string; init?: RequestInit };
  assert.equal(c.url, "http://127.0.0.1:8931/identify");
  assert.equal(c.init?.method, "POST");
  const body = JSON.parse(String(c.init?.body));
  assert.equal(typeof body.image_base64, "string");
  assert.ok(body.image_base64.length > 0);
  // base64로 복원하면 원본 이미지 바이트와 정확히 같아야 한다(인코딩 손실 없음).
  const decoded = Buffer.from(body.image_base64, "base64");
  assert.deepEqual(new Uint8Array(decoded), IMG[0]);
});

test("identify: 서버 응답을 IdentificationCandidate[]로 정확히 정규화한다", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        closed_full_ranking: [
          { sciName: "Forsythia koreana", korName: "개나리", score: 0.97 },
          { sciName: "Taraxacum officinale", korName: "민들레", score: 0.02 },
        ],
        final_tier: "high",
      }),
      { status: 200 },
    )) as typeof fetch;

  const provider = new BioClipProvider({ endpoint: "http://127.0.0.1:8931" });
  const result = await withMockedFetch(fakeFetch, () => provider.identify({ images: IMG }));

  assert.equal(result.source, "bioclip-hybrid");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0]?.scientificName, "Forsythia koreana");
  assert.equal(result.candidates[0]?.vernacularName, "개나리");
  assert.equal(result.candidates[0]?.rank, "species");
  // final_tier=high이므로 두 후보 모두 confidenceForTier 적용 후 "high"로 재분류돼야 한다
  // (raw가 낮아도 강제로 올라감 -- confidenceForTier.ts 설계와 일관).
  assert.equal(classifyConfidence(result.candidates[0]!.confidence), "high");
  assert.equal(classifyConfidence(result.candidates[1]!.confidence), "high");
  // 정렬 순서(0.97 > 0.02)가 인코딩 후에도 보존돼야 한다(단조성).
  assert.ok(result.candidates[0]!.confidence >= result.candidates[1]!.confidence);
});

test("identify: final_tier=unknown(DISAGREE_STRONG)이면 모든 후보가 unknown으로 강등된다", async () => {
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        closed_full_ranking: [{ sciName: "Toxicodendron vernicifluum", korName: "옻나무", score: 0.598 }],
        final_tier: "unknown",
      }),
      { status: 200 },
    )) as typeof fetch;

  const provider = new BioClipProvider({ endpoint: "http://127.0.0.1:8931" });
  const result = await withMockedFetch(fakeFetch, () => provider.identify({ images: IMG }));
  assert.equal(classifyConfidence(result.candidates[0]!.confidence), "unknown");
});

test("identify: HTTP 에러 응답(5xx)이면 명시적으로 throw한다", async () => {
  const fakeFetch = (async () => new Response("internal error", { status: 500 })) as typeof fetch;
  const provider = new BioClipProvider({ endpoint: "http://127.0.0.1:8931" });
  await assert.rejects(() => withMockedFetch(fakeFetch, () => provider.identify({ images: IMG })));
});

test("identify: 네트워크/타임아웃 에러가 나면 그대로 throw한다(게이트웨이가 catch)", async () => {
  const fakeFetch = (async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  }) as typeof fetch;
  const provider = new BioClipProvider({ endpoint: "http://127.0.0.1:8931", timeoutMs: 1 });
  await assert.rejects(() => withMockedFetch(fakeFetch, () => provider.identify({ images: IMG })));
});

test("identify: endpoint 미설정이면 fetch도 안 하고 즉시 throw한다", async () => {
  const provider = new BioClipProvider({ endpoint: "" });
  await assert.rejects(() => provider.identify({ images: IMG }));
});
