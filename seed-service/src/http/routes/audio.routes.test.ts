/**
 * 통합테스트: `POST /audio/sightings/upload` (3~4단계).
 * `sightings.routes.test.ts`(사진)와 같은 방식으로 Node 내장 FormData/Request로 진짜
 * multipart 바디를 만든다. 오디오는 실제 ffmpeg/Windows TTS로 디코딩 가능한 합성음을 쓴다
 * (core/audio/fixtures.ts) — 변환과 품질 분석이 실제로 동작하는 경로까지 검증하기 위함.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp, type App } from "../../composition.js";
import { loadConfig, type AppConfig } from "../../config/index.js";
import { buildHttpServer } from "../server.js";
import { makeRealAudio, makeRealSpeech, makeSilence } from "../../core/audio/fixtures.js";
import { asAudioSightingId, asTaxonId } from "../../core/domain/ids.js";
import { signMediaToken } from "../../core/media/mediaToken.js";
import type { SpeciesSoundReference } from "../../core/audio/reference/referenceTypes.js";
import type { TaxonId } from "../../core/domain/types.js";
import type { FastifyInstance } from "fastify";

function testConfig(): AppConfig {
  const cfg = loadConfig();
  cfg.nodeEnv = "test";
  cfg.identification.plantId.apiKey = undefined;
  cfg.identification.plantNet.apiKey = undefined;
  cfg.identification.freeDailyLimit = 0;
  cfg.mediaStorage.localDir = join(tmpdir(), `seed-service-test-${randomUUID()}`);
  cfg.audio.tempDir = join(tmpdir(), `seed-service-audio-test-${randomUUID()}`);
  cfg.auth.jwtSecret = "test-secret-not-for-production";
  return cfg;
}

async function testServer(): Promise<{ app: App; server: FastifyInstance; cfg: AppConfig }> {
  const cfg = testConfig();
  const app = await buildApp(cfg);
  const server = await buildHttpServer(app);
  return { app, server, cfg };
}

async function signup(server: FastifyInstance) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      email: `${randomUUID()}@b.com`,
      password: "pw12345",
      nickname: "A",
      avatar: "fox",
      privacy: true,
      location: true,
      photo: true,
      consent_version: "v1",
    },
  });
  const body = res.json();
  return { token: body.access_token as string, userId: body.user.user_id as string };
}

interface UploadFields {
  client_recording_id?: string;
  duration_ms?: string;
  recorded_at?: string;
  mode?: string;
  lat?: string;
  lng?: string;
}

async function buildAudioMultipart(
  audio: Uint8Array | undefined,
  fields: UploadFields,
  filename = "rec.m4a",
): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  if (audio) {
    form.append("audio", new Blob([audio as BlobPart], { type: "audio/m4a" }), filename);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) form.append(k, v);
  }
  const req = new Request("http://local/upload", { method: "POST", body: form });
  const contentType = req.headers.get("content-type")!;
  const body = Buffer.from(await req.arrayBuffer());
  return { body, contentType };
}

function defaultFields(overrides: UploadFields = {}): UploadFields {
  return {
    client_recording_id: randomUUID(),
    duration_ms: "4000",
    recorded_at: new Date().toISOString(),
    mode: "ambient",
    ...overrides,
  };
}

async function upload(
  server: FastifyInstance,
  token: string | undefined,
  audio: Uint8Array | undefined,
  fields: UploadFields,
  filename = "rec.m4a",
) {
  const { body, contentType } = await buildAudioMultipart(audio, fields, filename);
  const headers: Record<string, string> = { "content-type": contentType };
  if (token) headers.authorization = `Bearer ${token}`;
  return server.inject({ method: "POST", url: "/audio/sightings/upload", headers, payload: body });
}

test("POST /audio/sightings/upload: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const audio = await makeRealAudio({ seconds: 4, format: "m4a" });
  const res = await upload(server, undefined, audio, defaultFields());
  assert.equal(res.statusCode, 401);
});

test("POST /audio/sightings/upload: 정상 M4A 업로드는 200과 표준 응답 형태를 돌려준다", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 4, format: "m4a" });

  const res = await upload(server, token, audio, defaultFields());
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(typeof body.audio_sighting_id, "string");
  assert.equal(body.status, "ready");
  assert.equal(body.quality.usable, true);
  assert.deepEqual(body.quality.feedback_codes, []);
  assert.ok(Math.abs(body.quality.duration_ms - 4000) < 100);
  assert.equal(typeof body.expires_at, "string");
});

test("POST /audio/sightings/upload: WAV 입력도 통과한다", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  // 4단계(품질 검사) 이후로 최소 길이(3초, DECISIONS.md)보다 짧으면 형식과 무관하게
  // TOO_SHORT로 거부되므로, "WAV 자체가 통과하는지"를 보려면 3초 이상이어야 한다.
  const audio = await makeRealAudio({ seconds: 4, format: "wav" });

  const res = await upload(server, token, audio, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "ready");
});

test("POST /audio/sightings/upload: 3초 미만 녹음은 422 품질 거부(TOO_SHORT)", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 2, format: "wav" });

  const res = await upload(server, token, audio, defaultFields({ duration_ms: "2000" }), "rec.wav");
  assert.equal(res.statusCode, 422);
  const body = res.json();
  assert.equal(body.status, "rejected");
  assert.ok(body.quality.feedback_codes.includes("TOO_SHORT"));
  assert.equal(body.quality.usable, false);
});

test("POST /audio/sightings/upload: 오디오 파일 누락은 400 audio_invalid_format", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await upload(server, token, undefined, defaultFields());
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "audio_invalid_format");
});

test("POST /audio/sightings/upload: 필수 필드 누락은 400 audio_invalid_format", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 2, format: "m4a" });
  const res = await upload(server, token, audio, { mode: "ambient" }); // client_recording_id 등 누락
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "audio_invalid_format");
});

test("POST /audio/sightings/upload: 지원하지 않는 포맷(임의 바이트)은 400 audio_invalid_format", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const res = await upload(server, token, garbage, defaultFields(), "rec.bin");
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "audio_invalid_format");
});

test("POST /audio/sightings/upload: 10MB 초과는 413 audio_too_large", async () => {
  const { server, cfg } = await testServer();
  const { token } = await signup(server);
  // 시그니처 검사보다 먼저 크기 검사가 걸려야 하므로, RIFF/WAVE 헤더를 붙인 큰 더미 바이트.
  const oversized = new Uint8Array(cfg.audio.maxBytes + 1);
  oversized.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45], 0);
  const res = await upload(server, token, oversized, defaultFields(), "rec.wav");
  assert.equal(res.statusCode, 413);
  assert.equal(res.json().error, "audio_too_large");
});

test("POST /audio/sightings/upload: 같은 client_recording_id로 재시도하면 같은 audio_sighting_id를 돌려준다", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 3, format: "m4a" });
  const fields = defaultFields({ duration_ms: "3000" });

  const res1 = await upload(server, token, audio, fields);
  const res2 = await upload(server, token, audio, fields);
  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 200);
  assert.equal(res1.json().audio_sighting_id, res2.json().audio_sighting_id);
});

test("POST /audio/sightings/upload: 사람 음성이 우세한 녹음도 200으로 통과하고 동정 단계로 넘어간다(CR-20260729)", async () => {
  // ACCEPTANCE.md 시나리오 4(2026-07-29 갱신): 더 이상 업로드 단계에서 차단하지 않는다 —
  // "노이즈(사람 소리 등)가 섞여도 새소리를 인식해야 한다"는 사용자 결정. 오동정 방지는
  // /audio/identify 쪽 고확신 안전장치(AudioIdentificationGateway)가 담당한다.
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealSpeech("This recording contains a full human sentence, not a bird call.");
  const res = await upload(server, token, audio, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "ready");
  assert.equal(body.quality.usable, true);
  assert.ok(!body.quality.feedback_codes.includes("SPEECH_DETECTED"), JSON.stringify(body.quality));
  assert.ok(body.quality.valid_segments.length > 0);
});

test("POST /audio/sightings/upload: mode가 ambient가 아니면 400 audio_invalid_format", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 2, format: "m4a" });
  const res = await upload(server, token, audio, defaultFields({ mode: "practice" }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "audio_invalid_format");
});

test("DELETE /audio/sightings/:id: 소유한 미확정 세션의 파일과 DB 행을 함께 삭제한다", async () => {
  const { app, server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 4, format: "wav" });
  const uploaded = await upload(
    server,
    token,
    audio,
    defaultFields({ duration_ms: "4000" }),
    "rec.wav",
  );
  assert.equal(uploaded.statusCode, 200);

  const id = asAudioSightingId(uploaded.json().audio_sighting_id as string);
  const before = await app.repos.audioSightings.get(id);
  assert.ok(before?.storagePath);
  assert.ok(await app.audioTempStore.read(before.storagePath));

  const deleted = await server.inject({
    method: "DELETE",
    url: `/audio/sightings/${id}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(deleted.statusCode, 204);
  assert.equal(await app.repos.audioSightings.get(id), null);
  assert.equal(await app.audioTempStore.read(before.storagePath), null);
});

test("DELETE /audio/sightings/:id: 다른 사용자의 세션은 존재 여부를 숨기고 삭제하지 않는다", async () => {
  const { app, server } = await testServer();
  const owner = await signup(server);
  const stranger = await signup(server);
  const audio = await makeRealAudio({ seconds: 4, format: "wav" });
  const uploaded = await upload(
    server,
    owner.token,
    audio,
    defaultFields({ duration_ms: "4000" }),
    "rec.wav",
  );
  const id = asAudioSightingId(uploaded.json().audio_sighting_id as string);

  const denied = await server.inject({
    method: "DELETE",
    url: `/audio/sightings/${id}`,
    headers: { authorization: `Bearer ${stranger.token}` },
  });
  assert.equal(denied.statusCode, 404);
  assert.ok(await app.repos.audioSightings.get(id));
});

// ── 6단계: POST /audio/identify ─────────────────────────────────────────────
// BioClipProvider.test.ts와 같은 원칙 — 전역 fetch를 모킹해 실제 GPU 서버 없이 검증한다.
function withMockedFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function fakeBirdNetResponse(
  segments: { start_s: number; end_s: number; candidates: { sci_name: string; label: string; score: number }[] }[],
) {
  return (async () =>
    new Response(
      JSON.stringify({
        model_version: "birdnet@audio-mvp-1.0.0",
        quality: { duration_s: 4, sample_rate: 48000, segment_duration_s: 3 },
        segments: segments.map((s) => ({ ...s, embedding: [] })),
      }),
      { status: 200 },
    )) as typeof fetch;
}

async function uploadReadySighting(server: FastifyInstance, token: string): Promise<string> {
  const audio = await makeRealAudio({ seconds: 4, format: "wav" });
  const res = await upload(server, token, audio, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(res.statusCode, 200, "테스트 전제(정상 업로드)가 깨짐: " + JSON.stringify(res.json()));
  return res.json().audio_sighting_id as string;
}

async function callIdentify(server: FastifyInstance, token: string | undefined, audioSightingId: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return server.inject({
    method: "POST",
    url: "/audio/identify",
    headers,
    payload: { audio_sighting_id: audioSightingId },
  });
}

test("POST /audio/identify: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await callIdentify(server, undefined, randomUUID());
  assert.equal(res.statusCode, 401);
});

test("POST /audio/identify: 존재하지 않는 세션은 404 not_found", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await callIdentify(server, token, randomUUID());
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify: 남의 세션은 존재 여부를 안 드러내고 같은 404 not_found", async () => {
  const { server } = await testServer();
  const { token: ownerToken } = await signup(server);
  const { token: otherToken } = await signup(server);
  const sightingId = await uploadReadySighting(server, ownerToken);

  const res = await callIdentify(server, otherToken, sightingId);
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify: 품질 거부(rejected)된 세션은 404 not_found(STATE_MACHINE.md — identify 불허)", async () => {
  // CR-20260729-noisy-audio-reaches-model 이후로는 사람 음성만으로는 더 이상 거부되지
  // 않으므로(위 테스트 참고), "정말 거부되는" 무음 오디오로 rejected 상태를 재현한다.
  const { server } = await testServer();
  const { token } = await signup(server);
  const speech = await makeSilence(4);
  const uploadRes = await upload(server, token, speech, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(uploadRes.statusCode, 422); // 사전조건: 정말 거부됐는지
  const sightingId = uploadRes.json().audio_sighting_id as string;

  const res = await callIdentify(server, token, sightingId);
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify: 만료된 세션은 404 not_found", async () => {
  const { server, app } = await testServer();
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  // TTL이 지난 것처럼 만들기 위해 저장소에서 직접 만료 시각을 과거로 되돌린다(실제 시간이
  // 지나가길 기다리지 않고 "만료" 상태를 결정론적으로 재현).
  const audioSightingId = asAudioSightingId(sightingId);
  const sighting = await app.repos.audioSightings.get(audioSightingId);
  assert.ok(sighting);
  await app.repos.audioSightings.create({
    ...sighting!,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const res = await callIdentify(server, token, sightingId);
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify: 정상 동정은 200과 계약 형태(candidates/confidence_level/model_version)를 돌려준다", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token, userId } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.87 }] },
    { start_s: 3, end_s: 4, candidates: [] },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.audio_sighting_id, sightingId);
  assert.equal(body.unknown, false);
  assert.equal(body.needs_user_confirmation, true);
  assert.equal(body.model_version, "birdnet@audio-mvp-1.0.0");
  assert.equal(body.candidates.length, 1);
  assert.equal(body.candidates[0].species_id, "taxon-hypsipetes-amaurotis");
  assert.equal(body.candidates[0].common_name_ko, "직박구리");
  assert.equal(body.candidates[0].confidence_level, "high");
  assert.equal(body.candidates[0].is_dangerous, false);
  assert.equal(body.unknown_reason, undefined, "unknown=false면 unknown_reason 필드가 없어야 함");

  // API_CONTRACT.md Common rules: "POST /audio/identify ... must not change observations".
  const observations = await app.repos.observations.listByUser(userId as never);
  assert.equal(observations.length, 0, "동정만으로는 관찰을 만들면 안 됨");
});

test("POST /audio/identify: 모든 후보가 low 임계값(0.35) 미만이면 200 unknown=true", async () => {
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.2 }] },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.unknown, true);
  assert.equal(body.unknown_reason, "NO_SUPPORTED_BIRD_MATCH");
  assert.equal(body.needs_user_confirmation, false);
  assert.deepEqual(body.candidates, []);
});

test("POST /audio/identify: CR-20260729-species-outside-db — taxon DB에 없는 종도 supported=false로 노출된다(unknown=false)", async () => {
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Sturnus vulgaris", label: "European Starling", score: 0.9 }] },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.unknown, false);
  assert.equal(body.candidates.length, 1);
  assert.equal(body.candidates[0].species_id, null);
  assert.equal(body.candidates[0].supported, false);
  assert.equal(body.candidates[0].common_name_ko, "European Starling");
});

test("POST /audio/identify: 모델 서비스 오류는 503 audio_processor_unavailable(doc03 '모델 오류는 5xx')", async () => {
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  const fakeFetch = (async () => new Response("internal error", { status: 500 })) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audio_processor_unavailable");
  assert.equal(res.json().retryable, true);
});

test("POST /audio/identify: 모델 서비스 타임아웃(AbortError)도 5xx 오류와 같은 503으로 처리한다", async () => {
  // 일반 5xx(위 테스트)와 코드 경로가 다르다 — fetch가 응답을 받는 게 아니라 AbortSignal.timeout이
  // 던지는 DOMException("AbortError")를 그대로 통과시켜야 한다(BirdNetAudioProvider.test.ts의
  // 단위 테스트와 동일한 실패 유형을 라우트 레벨까지 따라가서 확인).
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  const fakeFetch = (async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  }) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audio_processor_unavailable");
  assert.equal(res.json().retryable, true);
});

test("POST /audio/identify: 모델 서비스가 아예 설정 안 됐으면(기본값) 503", async () => {
  const { server } = await testServer(); // cfg.audio.model.endpoint를 안 채움(기본 꺼짐)
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);

  const res = await callIdentify(server, token, sightingId);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audio_processor_unavailable");
});

// ── 7단계: POST /audio/identify/confirm ──────────────────────────────────
async function uploadIdentifiedSighting(
  server: FastifyInstance,
  cfg: AppConfig,
  token: string,
): Promise<{ audioSightingId: string; speciesId: string }> {
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const audioSightingId = await uploadReadySighting(server, token);
  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.87 }] },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, audioSightingId));
  assert.equal(res.statusCode, 200, "테스트 전제(정상 동정)가 깨짐: " + JSON.stringify(res.json()));
  return { audioSightingId, speciesId: res.json().candidates[0].species_id as string };
}

function callConfirm(
  server: FastifyInstance,
  token: string | undefined,
  body: { audio_sighting_id: string; species_id: string; confirmation_id: string },
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return server.inject({ method: "POST", url: "/audio/identify/confirm", headers, payload: body });
}

test("POST /audio/identify/confirm: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await callConfirm(server, undefined, {
    audio_sighting_id: randomUUID(),
    species_id: "taxon-hypsipetes-amaurotis",
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 401);
});

test("POST /audio/identify/confirm: 존재하지 않는 세션은 404 not_found", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await callConfirm(server, token, {
    audio_sighting_id: randomUUID(),
    species_id: "taxon-hypsipetes-amaurotis",
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify/confirm: 남의 세션은 같은 404 not_found", async () => {
  const { server, cfg } = await testServer();
  const { token: ownerToken } = await signup(server);
  const { token: otherToken } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, ownerToken);

  const res = await callConfirm(server, otherToken, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify/confirm: 품질 거부(rejected)된 세션은 404 not_found", async () => {
  // CR-20260729-noisy-audio-reaches-model 이후로는 사람 음성만으로는 더 이상 거부되지
  // 않으므로, "정말 거부되는" 무음 오디오로 rejected 상태를 재현한다.
  const { server } = await testServer();
  const { token } = await signup(server);
  const speech = await makeSilence(4);
  const uploadRes = await upload(server, token, speech, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(uploadRes.statusCode, 422);
  const sightingId = uploadRes.json().audio_sighting_id as string;

  const res = await callConfirm(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify/confirm: 만료된 세션은 404 not_found", async () => {
  const { server, app, cfg } = await testServer();
  const { token } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, token);

  const id = asAudioSightingId(audioSightingId);
  const sighting = await app.repos.audioSightings.get(id);
  assert.ok(sighting);
  await app.repos.audioSightings.create({
    ...sighting!,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const res = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/identify/confirm: 아직 /audio/identify를 안 한 세션은 400 not_identified_yet", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audioSightingId = await uploadReadySighting(server, token);

  const res = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: "taxon-hypsipetes-amaurotis",
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "not_identified_yet");
});

test("POST /audio/identify/confirm: 후보 스냅샷에 없는 종을 확정하려 하면 400 invalid_species_id(위조 방지)", async () => {
  const { server, cfg } = await testServer();
  const { token } = await signup(server);
  const { audioSightingId } = await uploadIdentifiedSighting(server, cfg, token);

  const res = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: "taxon-does-not-exist",
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_species_id");
});

test("POST /audio/identify/confirm: 정상 확정은 200과 계약 형태(observation_id/species_id/dex_updated/reward)를 돌려주고, 관찰 1건과 보상을 만든다", async () => {
  const { server, app, cfg } = await testServer();
  const { token, userId } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, token);

  const res = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(typeof body.observation_id, "string");
  assert.equal(body.modality, "audio");
  assert.equal(body.species_id, speciesId);
  assert.equal(body.dex_updated, true, "이 유저의 첫 해금이므로 true여야 함");
  assert.equal(body.reward.xp, 10, "첫 해금 관찰의 기본 XP");
  assert.deepEqual(body.reward.quest_ids, []);

  const observations = await app.repos.observations.listByUser(userId as never);
  assert.equal(observations.length, 1);
  assert.equal(observations[0]!.modality, "audio");
  assert.equal(observations[0]!.taxonId, speciesId);
  assert.deepEqual(observations[0]!.media, []);
});

test("POST /audio/identify/confirm: 같은 confirmation_id로 3번 반복해도 관찰과 보상은 정확히 1번만 생긴다(멱등)", async () => {
  const { server, app, cfg } = await testServer();
  const { token, userId } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, token);
  const confirmationId = randomUUID();
  const body = { audio_sighting_id: audioSightingId, species_id: speciesId, confirmation_id: confirmationId };

  const res1 = await callConfirm(server, token, body);
  const res2 = await callConfirm(server, token, body);
  const res3 = await callConfirm(server, token, body);

  assert.equal(res1.statusCode, 200);
  assert.equal(res2.statusCode, 200);
  assert.equal(res3.statusCode, 200);
  assert.deepEqual(res1.json(), res2.json(), "재요청은 원본 응답을 그대로 재생해야 함");
  assert.deepEqual(res1.json(), res3.json());

  const observations = await app.repos.observations.listByUser(userId as never);
  assert.equal(observations.length, 1, "관찰은 정확히 1건이어야 함(ACCEPTANCE.md 시나리오 7)");
});

test("POST /audio/identify/confirm: 다른 confirmation_id로 이미 확정된 세션을 다시 확정하려 하면 409 already_confirmed", async () => {
  const { server, cfg } = await testServer();
  const { token } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, token);

  const first = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(),
  });
  assert.equal(first.statusCode, 200);

  const second = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(), // 다른 confirmation_id
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error, "already_confirmed");
});

test("POST /audio/identify/confirm: 서로 다른 confirmation_id로 동시에 확정 요청이 와도 정확히 하나만 성공하고 관찰은 1건만 생긴다(경쟁 방지)", async () => {
  // claimConfirmation()의 원자적 compare-and-swap(WHERE/if confirmation_id IS NULL)을
  // 실제 동시성(Promise.all)으로 검증 — 순차 재시도 테스트와 달리 세 요청이 진짜로
  // 겹쳐서 도착했을 때도 같은 보장이 성립하는지 확인한다.
  const { server, app, cfg } = await testServer();
  const { token, userId } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, token);

  const [r1, r2, r3] = await Promise.all([
    callConfirm(server, token, { audio_sighting_id: audioSightingId, species_id: speciesId, confirmation_id: randomUUID() }),
    callConfirm(server, token, { audio_sighting_id: audioSightingId, species_id: speciesId, confirmation_id: randomUUID() }),
    callConfirm(server, token, { audio_sighting_id: audioSightingId, species_id: speciesId, confirmation_id: randomUUID() }),
  ]);
  const statusCodes = [r1.statusCode, r2.statusCode, r3.statusCode].sort();
  assert.deepEqual(statusCodes, [200, 409, 409], "정확히 하나만 성공해야 함");

  const observations = await app.repos.observations.listByUser(userId as never);
  assert.equal(observations.length, 1, "동시 요청이어도 관찰은 정확히 1건이어야 함");
});

// ── 8단계: GET /species/:id/sounds, GET /audio/reference/:refId, POST /audio/similarity/score ──
function refRow(overrides: Partial<SpeciesSoundReference> & { id: string; taxonId: TaxonId }): SpeciesSoundReference {
  return {
    callType: "call",
    durationMs: 5000,
    sourceUrl: "https://xeno-canto.org/9999999/download",
    creator: "테스트 녹음자",
    license: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "테스트 녹음자 via xeno-canto.org (XC9999999)",
    qualityStatus: "approved",
    referenceSetVersion: "kr-bird-reference@2026-07",
    mediaRef: "",
    ...overrides,
  };
}

/** 승인된 참조 클립 1건을 실제로 만든다 — 진짜 오디오 바이트(재생 라우트 검증용)와 진짜
 * 임베딩(유사도 채점 검증용)을 각각 스토어에 저장하고, DB 행을 upsert한다. */
async function seedApprovedReference(
  app: App,
  id: string,
  taxonId: string,
  embedding: number[],
  wavBytes: Buffer,
): Promise<void> {
  const mediaRef = await app.referenceMediaStore.save(wavBytes);
  const embeddingRef = await app.referenceEmbeddingStore.save(embedding);
  await app.repos.speciesSoundReferences.upsertMany([
    refRow({ id, taxonId: asTaxonId(taxonId), mediaRef, embeddingRef }),
  ]);
}

test("GET /species/:speciesId/sounds: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/species/taxon-hypsipetes-amaurotis/sounds" });
  assert.equal(res.statusCode, 401);
});

test("GET /species/:speciesId/sounds: 존재하지 않는 종은 404", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await server.inject({
    method: "GET",
    url: "/species/taxon-does-not-exist/sounds",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 404);
});

test("GET /species/:speciesId/sounds: 승인된 참조가 없으면 supported_for_similarity=false, clips=[]", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await server.inject({
    method: "GET",
    url: "/species/taxon-hypsipetes-amaurotis/sounds",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.species_id, "taxon-hypsipetes-amaurotis");
  assert.equal(body.supported_for_similarity, false);
  assert.deepEqual(body.clips, []);
});

test("GET /species/:speciesId/sounds: 승인된 참조가 있으면 계약 형태(clips[].id/call_type/duration_ms/attribution/license/source_url/playback_url)로 나온다", async () => {
  const { server, app } = await testServer();
  const { token } = await signup(server);
  await seedApprovedReference(
    app,
    "ref-hypsipetes-001",
    "taxon-hypsipetes-amaurotis",
    [1, 0],
    Buffer.from("fake-wav-bytes"),
  );

  const res = await server.inject({
    method: "GET",
    url: "/species/taxon-hypsipetes-amaurotis/sounds",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.supported_for_similarity, true);
  assert.equal(body.reference_set_version, "kr-bird-reference@2026-07");
  assert.equal(body.clips.length, 1);
  const clip = body.clips[0];
  assert.equal(clip.id, "ref-hypsipetes-001");
  assert.equal(clip.call_type, "call");
  assert.equal(clip.duration_ms, 5000);
  assert.equal(clip.attribution, "테스트 녹음자 via xeno-canto.org (XC9999999)");
  assert.equal(clip.license, "https://creativecommons.org/licenses/by/4.0/");
  assert.ok(String(clip.playback_url).includes("mt="), "단기 서명 토큰이 붙어야 함");
});

test("GET /audio/reference/:refId: mt 없이 요청하면 401", async () => {
  const { server, app } = await testServer();
  await seedApprovedReference(app, "ref-x-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("hello"));
  const res = await server.inject({ method: "GET", url: "/audio/reference/ref-x-001" });
  assert.equal(res.statusCode, 401);
});

test("GET /audio/reference/:refId: 다른 클립용 서명 토큰을 재사용하면 401(클립 id에 고정됨)", async () => {
  const { server, app, cfg } = await testServer();
  await seedApprovedReference(app, "ref-x-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("hello"));
  const wrongMt = signMediaToken("ref-other-clip", cfg.auth.jwtSecret || "test-secret-not-for-production");
  const res = await server.inject({ method: "GET", url: `/audio/reference/ref-x-001?mt=${wrongMt}` });
  assert.equal(res.statusCode, 401);
});

test("GET /audio/reference/:refId: 승인된 클립을 /sounds가 준 실제 playback_url로 재생하면 200과 실제 바이트", async () => {
  const { server, app } = await testServer();
  const { token } = await signup(server);
  const wavBytes = Buffer.from("real-fake-wav-bytes-for-playback-test");
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], wavBytes);

  const soundsRes = await server.inject({
    method: "GET",
    url: "/species/taxon-hypsipetes-amaurotis/sounds",
    headers: { authorization: `Bearer ${token}` },
  });
  const playbackUrl = soundsRes.json().clips[0].playback_url as string;

  const res = await server.inject({ method: "GET", url: playbackUrl });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.rawPayload, wavBytes);
});

// --- POST /audio/similarity/score ---
async function callSimilarityScore(
  server: FastifyInstance,
  token: string | undefined,
  body: { audio_sighting_id: string; species_id: string; mode?: string },
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return server.inject({
    method: "POST",
    url: "/audio/similarity/score",
    headers,
    payload: { mode: "ambient", ...body },
  });
}

test("POST /audio/similarity/score: 인증 없으면 401", async () => {
  const { server } = await testServer();
  const res = await callSimilarityScore(server, undefined, {
    audio_sighting_id: randomUUID(),
    species_id: "taxon-hypsipetes-amaurotis",
  });
  assert.equal(res.statusCode, 401);
});

test("POST /audio/similarity/score: 존재하지 않는 세션은 404 not_found", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const res = await callSimilarityScore(server, token, {
    audio_sighting_id: randomUUID(),
    species_id: "taxon-hypsipetes-amaurotis",
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error, "not_found");
});

test("POST /audio/similarity/score: mode가 ambient가 아니면 400", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const res = await callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
    mode: "practice",
  });
  assert.equal(res.statusCode, 400);
});

test("POST /audio/similarity/score: 존재하지 않는 species_id는 400 invalid_species_id", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const res = await callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-does-not-exist",
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "invalid_species_id");
});

test("POST /audio/similarity/score: 승인된 참조가 없는 종은 422 similarity_not_supported_for_species", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const res = await callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error, "similarity_not_supported_for_species");
});

test("POST /audio/similarity/score: 정상 채점은 200과 계약 형태를 돌려주고 관찰/도감/퀘스트/보상에 아무 영향을 주지 않는다", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token, userId } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("x"));

  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        model_version: "birdnet-acoustic-2.4-pb",
        quality: { duration_s: 3, sample_rate: 48000, segment_duration_s: 3 },
        segments: [{ start_s: 0, end_s: 3, candidates: [], embedding: [1, 0] }],
      }),
      { status: 200 },
    )) as typeof fetch;

  const res = await withMockedFetch(fakeFetch, () => callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
  }));

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.audio_sighting_id, sightingId);
  assert.equal(body.species_id, "taxon-hypsipetes-amaurotis");
  assert.equal(body.score, 100);
  assert.equal(body.grade, "strong_match");
  assert.ok(["high", "medium", "low"].includes(body.score_reliability));
  assert.deepEqual(body.matched_segment, { start_ms: 0, end_ms: 3000 });
  assert.deepEqual(body.feedback_codes, []);
  assert.equal(body.model_version, "birdnet-acoustic-2.4-pb");
  assert.equal(body.reference_set_version, "kr-bird-reference@2026-07");

  // ACCEPTANCE.md 시나리오 8: "Similarity scoring: Score shown; no product mutation".
  const observations = await app.repos.observations.listByUser(userId as never);
  assert.equal(observations.length, 0, "유사도 채점은 관찰을 만들면 안 됨");
});

test("POST /audio/similarity/score: 모델 서비스 오류는 503 audio_processor_unavailable", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("x"));

  const fakeFetch = (async () => new Response("internal error", { status: 500 })) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () => callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
  }));

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audio_processor_unavailable");
});

test("POST /audio/similarity/score: 모델 서비스 타임아웃(AbortError)도 5xx 오류와 같은 503으로 처리한다", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("x"));

  const fakeFetch = (async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  }) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () => callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
  }));

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "audio_processor_unavailable");
});

// ── 9단계: GET /audio/health ────────────────────────────────────────────
test("GET /audio/health: 모델 미설정 + 승인된 참조 없음(기본 테스트 환경)은 인증 없이도 503과 ready=false", async () => {
  const { server } = await testServer();
  const res = await server.inject({ method: "GET", url: "/audio/health" });
  assert.equal(res.statusCode, 503);
  const body = res.json();
  assert.equal(body.ready, false);
  assert.equal(body.model.configured, false);
  assert.equal(body.model.reachable, false);
  assert.equal(body.reference_embeddings.ready, false);
  assert.equal(body.reference_embeddings.approved_clip_count, 0);
});

test("GET /audio/health: 모델 도달 가능 + 승인된 임베딩 참조 있음 → 200과 ready=true", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("x"));

  const fakeFetch = (async () => new Response("", { status: 200 })) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () => server.inject({ method: "GET", url: "/audio/health" }));

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ready, true);
  assert.equal(body.model.configured, true);
  assert.equal(body.model.reachable, true);
  assert.equal(body.reference_embeddings.ready, true);
  assert.equal(body.reference_embeddings.approved_clip_count, 1);
});

test("GET /audio/health: 모델이 설정됐지만 /ready가 실패 응답이면 503", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("x"));

  const fakeFetch = (async () => new Response("", { status: 503 })) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () => server.inject({ method: "GET", url: "/audio/health" }));

  assert.equal(res.statusCode, 503);
  assert.equal(res.json().model.reachable, false);
});

// ── 10단계: fixture 계약 테스트 ──────────────────────────────────────────
/**
 * 지금까지(6~9단계)는 각 스테이지에서 사람이 `docs/audio/fixtures/*.json`을 눈으로 대조해
 * 응답 형태를 맞췄을 뿐, 그 fixture 파일들을 실제로 읽어서 코드가 자동으로 검증하는 테스트는
 * 없었다 — 즉 누군가 나중에 fixture를 고치거나 매퍼를 리팩터링해도 아무 테스트도 실패하지
 * 않을 수 있었다. doc03 10단계 완료 기준 "fixture 계약 테스트 통과"에 대응해, 실제
 * `docs/audio/fixtures/*.json` 파일을 읽어 실응답과 "키 집합 + 타입"을 재귀적으로 비교한다.
 * 리터럴 값(예: similarity의 score=78)까지 재현하진 않는다 — 그건 계약이 보장하는 바가
 * 아니고(`similarityScoring.test.ts` 주석 참고), 이 테스트의 목적은 "구조가 fixture와
 * 어긋나면 즉시 잡아낸다"이지 "예시값을 그대로 재현한다"가 아니다.
 * `error-network.json`은 대상에서 제외 — API_CONTRACT.md: "trace_id can be omitted when no
 * server request was made, such as a device-only network error", 즉 서버를 아예 호출하지
 * 않는 클라이언트(doc02 앱 트랙) 전용 에러라 seed-service가 만들어낼 응답이 아니다.
 */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/audio/fixtures");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

// AudioQuality.snrDb는 도메인 타입 자체가 number | null이다(무음/대비부족이면 null —
// AudioQualityAnalyzer.ts) — fixture 예시가 우연히 숫자든 null이든, 이 필드만은 항상
// 둘 다 허용해야 정확하다(어느 한쪽만 예로 든 fixture 값의 타입에 억지로 맞추지 않는다).
const NULLABLE_NUMBER_FIELDS = new Set(["snr_db"]);

function assertContractShape(actual: unknown, fixture: unknown, path: string): void {
  const key = path.slice(path.lastIndexOf(".") + 1);
  if (NULLABLE_NUMBER_FIELDS.has(key)) {
    assert.ok(actual === null || typeof actual === "number", `${path}: null 또는 number여야 함`);
    return;
  }
  if (Array.isArray(fixture)) {
    assert.ok(Array.isArray(actual), `${path}: 배열이어야 함`);
    if (fixture.length > 0 && (actual as unknown[]).length > 0) {
      assertContractShape((actual as unknown[])[0], fixture[0], `${path}[0]`);
    }
    return;
  }
  if (fixture !== null && typeof fixture === "object") {
    assert.ok(actual !== null && typeof actual === "object", `${path}: 객체여야 함`);
    const fixtureKeys = Object.keys(fixture as Record<string, unknown>).sort();
    const actualKeys = Object.keys(actual as Record<string, unknown>).sort();
    assert.deepEqual(actualKeys, fixtureKeys, `${path}: 키 집합이 fixture와 달라짐`);
    for (const k of fixtureKeys) {
      assertContractShape(
        (actual as Record<string, unknown>)[k],
        (fixture as Record<string, unknown>)[k],
        `${path}.${k}`,
      );
    }
    return;
  }
  if (fixture === null) {
    assert.equal(actual, null, `${path}: null이어야 함`);
    return;
  }
  assert.equal(typeof actual, typeof fixture, `${path}: 타입이 fixture와 달라짐(${typeof actual} !== ${typeof fixture})`);
}

test("계약 fixture: upload-success.json과 실제 업로드 응답의 구조가 일치한다", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const audio = await makeRealAudio({ seconds: 4, format: "wav" });
  const res = await upload(server, token, audio, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(res.statusCode, 200);
  assertContractShape(res.json(), loadFixture("upload-success.json"), "upload-success");
});

test("계약 fixture: upload-quality-rejected.json과 실제 거부 응답의 구조가 일치한다", async () => {
  // CR-20260729-noisy-audio-reaches-model 이후로는 사람 음성만으로는 더 이상 거부되지
  // 않으므로, "정말 거부되는" 무음 오디오로 이 계약 형태를 검증한다.
  const { server } = await testServer();
  const { token } = await signup(server);
  const silence = await makeSilence(4);
  const res = await upload(server, token, silence, defaultFields({ duration_ms: "4000" }), "rec.wav");
  assert.equal(res.statusCode, 422);
  assertContractShape(res.json(), loadFixture("upload-quality-rejected.json"), "upload-quality-rejected");
});

test("계약 fixture: identify-high-confidence.json과 실제 동정 응답의 구조가 일치한다", async () => {
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.87 }] },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));
  assert.equal(res.statusCode, 200);
  assertContractShape(res.json(), loadFixture("identify-high-confidence.json"), "identify-high-confidence");
});

test("계약 fixture: identify-multiple-candidates.json과 실제 동정 응답의 구조가 일치한다", async () => {
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const fakeFetch = fakeBirdNetResponse([
    {
      start_s: 0,
      end_s: 3,
      candidates: [
        { sci_name: "Passer montanus", label: "Eurasian Tree Sparrow", score: 0.62 },
        { sci_name: "Pica serica", label: "Oriental Magpie", score: 0.41 },
      ],
    },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().candidates.length, 2, "테스트 전제(medium+low 두 후보)가 깨짐");
  assertContractShape(res.json(), loadFixture("identify-multiple-candidates.json"), "identify-multiple-candidates");
});

test("계약 fixture: identify-unknown.json과 실제 미지원 응답의 구조가 일치한다", async () => {
  // CR-20260729-species-outside-db 이후로는 taxon DB에 없는 종도 후보로 노출되므로(unknown이
  // 아님), 진짜 unknown을 재현하려면 low 임계값(0.35) 미만 점수를 써야 한다.
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.2 }] },
  ]);
  const res = await withMockedFetch(fakeFetch, () => callIdentify(server, token, sightingId));
  assert.equal(res.statusCode, 200);
  assertContractShape(res.json(), loadFixture("identify-unknown.json"), "identify-unknown");
});

test("계약 fixture: confirm-success.json과 실제 확정 응답의 구조가 일치한다", async () => {
  const { server, cfg } = await testServer();
  const { token } = await signup(server);
  const { audioSightingId, speciesId } = await uploadIdentifiedSighting(server, cfg, token);
  const res = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(),
  });
  assert.equal(res.statusCode, 200);
  assertContractShape(res.json(), loadFixture("confirm-success.json"), "confirm-success");
});

test("2026-07-29 버그 수정: 좌표와 함께 소리로 확정한 종이 /map/pins에 뜬다", async () => {
  // 이전엔 lat/lng을 파싱만 하고 버려서 소리로 확정한 observation엔 preciseCoord가 전혀
  // 없었고, /map/pins가 좌표 없는 관찰을 걸러내 지도에서 항상 빠졌다(0006 마이그레이션 +
  // AudioUploadService/recordIdentification 수정으로 해결).
  const { server, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);

  const audio = await makeRealAudio({ seconds: 4, format: "wav" });
  const uploadRes = await upload(
    server,
    token,
    audio,
    defaultFields({ duration_ms: "4000", lat: "36.36", lng: "127.38" }),
    "rec.wav",
  );
  assert.equal(uploadRes.statusCode, 200);
  const audioSightingId = uploadRes.json().audio_sighting_id as string;

  const fakeFetch = fakeBirdNetResponse([
    { start_s: 0, end_s: 3, candidates: [{ sci_name: "Hypsipetes amaurotis", label: "Brown-eared Bulbul", score: 0.87 }] },
  ]);
  const identifyRes = await withMockedFetch(fakeFetch, () => callIdentify(server, token, audioSightingId));
  assert.equal(identifyRes.statusCode, 200);
  const speciesId = identifyRes.json().candidates[0].species_id as string;

  const confirmRes = await callConfirm(server, token, {
    audio_sighting_id: audioSightingId,
    species_id: speciesId,
    confirmation_id: randomUUID(),
  });
  assert.equal(confirmRes.statusCode, 200);

  const pinsRes = await server.inject({
    method: "GET",
    url: "/map/pins",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(pinsRes.statusCode, 200);
  const pins = pinsRes.json() as Array<{ species_id: string; lat: number; lng: number }>;
  const pin = pins.find((p) => p.species_id === speciesId);
  assert.ok(pin, "소리로 확정한 종이 지도 핀에 있어야 함: " + JSON.stringify(pins));
  assert.ok(Math.abs(pin!.lat - 36.36) < 0.001);
  assert.ok(Math.abs(pin!.lng - 127.38) < 0.001);
});

test("계약 fixture: similarity-success.json과 실제 채점 응답의 구조가 일치한다", async () => {
  const { server, app, cfg } = await testServer();
  cfg.audio.model.endpoint = "http://fake-birdnet-test";
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  await seedApprovedReference(app, "ref-hypsipetes-001", "taxon-hypsipetes-amaurotis", [1, 0], Buffer.from("x"));

  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        model_version: "birdnet-acoustic-2.4-pb",
        quality: { duration_s: 3, sample_rate: 48000, segment_duration_s: 3 },
        segments: [{ start_s: 0, end_s: 3, candidates: [], embedding: [1, 0] }],
      }),
      { status: 200 },
    )) as typeof fetch;
  const res = await withMockedFetch(fakeFetch, () =>
    callSimilarityScore(server, token, { audio_sighting_id: sightingId, species_id: "taxon-hypsipetes-amaurotis" }),
  );
  assert.equal(res.statusCode, 200);
  assertContractShape(res.json(), loadFixture("similarity-success.json"), "similarity-success");
});

test("계약 fixture: similarity-not-supported.json과 실제 미지원 종 에러 응답의 구조가 일치한다", async () => {
  const { server } = await testServer();
  const { token } = await signup(server);
  const sightingId = await uploadReadySighting(server, token);
  const res = await callSimilarityScore(server, token, {
    audio_sighting_id: sightingId,
    species_id: "taxon-hypsipetes-amaurotis",
  });
  assert.equal(res.statusCode, 422);
  assertContractShape(res.json(), loadFixture("similarity-not-supported.json"), "similarity-not-supported");
});
