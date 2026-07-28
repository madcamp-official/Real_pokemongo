/**
 * 10단계 성능 측정용 1회성 스크립트 (SPIKE_REPORT.md/STAGE2_MODEL_SERVICE.md와 같은
 * "실측 후 리포트에 남긴다" 성격 — 자동화 테스트가 아니라 사람이 직접 실행하는 도구다).
 *
 * doc03 10단계가 요구하는 4가지를 실 CAMP-3(모델 서비스) + 실 Postgres(터널 필요)로 잰다:
 *   1) 10초 입력의 평균/P95 지연
 *   2) 동시 요청별 지연(및 그때 무슨 일이 일어나는지: CAMP-3 세마포어 cap=4 초과분)
 *   3) 변환(ffmpeg)과 모델 추론 시간을 분리 — 업로드 호출(변환 포함)과 identify 호출(순수
 *      모델 왕복, 변환은 이미 끝난 뒤)을 따로 측정해서 얻는다
 *   4) CPU/RAM/GPU/VRAM은 이 스크립트가 직접 재지 않는다 — Node 프로세스 쪽은
 *      `process.memoryUsage()`로 전/후만 찍고, GPU/VRAM은 실행 중 별도 터미널에서
 *      `ssh root@172.10.5.71 nvidia-smi`를 폴링해서 리포트에 같이 기록한다(스크립트와
 *      쉘을 억지로 동기화하는 것보다 이게 더 정직하고 단순하다).
 *
 * 끝나면 DELETE /account로 이 스크립트가 만든 테스트 유저/오디오 세션을 전부 지운다 —
 * 실 프로덕션 DB(관찰 49건)를 건드리지 않는다는 이 세션 내내의 원칙을 그대로 따른다.
 *
 * 실행: AUDIO_MODEL_SERVICE_URL=http://127.0.0.1:8932 npx tsx --env-file=.env
 *   research/audio-model-spike/stage10-perf-measure.ts
 */
import { loadConfig } from "../../src/config/index.js";
import { buildApp } from "../../src/composition.js";
import { buildHttpServer } from "../../src/http/server.js";
import { makeRealAudio } from "../../src/core/audio/fixtures.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

function summarize(label: string, samplesMs: number[]) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const avg = samplesMs.reduce((a, b) => a + b, 0) / samplesMs.length;
  console.log(
    `  ${label}: n=${samplesMs.length} avg=${avg.toFixed(1)}ms p95=${percentile(sorted, 95).toFixed(1)}ms ` +
      `min=${sorted[0]!.toFixed(1)}ms max=${sorted[sorted.length - 1]!.toFixed(1)}ms`,
  );
}

async function signup(server: FastifyInstance) {
  const res = await server.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      email: `perf-${randomUUID()}@b.com`,
      password: "pw12345",
      nickname: "perf",
      avatar: "fox",
      privacy: true,
      location: true,
      photo: true,
      consent_version: "v1",
    },
  });
  return res.json().access_token as string;
}

async function upload(server: FastifyInstance, token: string, audio: Uint8Array) {
  const form = new FormData();
  form.append("audio", new Blob([audio as BlobPart], { type: "audio/wav" }), "rec.wav");
  form.append("client_recording_id", randomUUID());
  form.append("duration_ms", "10000");
  form.append("recorded_at", new Date().toISOString());
  form.append("mode", "ambient");
  const req = new Request("http://local/upload", { method: "POST", body: form });
  const body = Buffer.from(await req.arrayBuffer());
  const contentType = req.headers.get("content-type")!;

  const t0 = performance.now();
  const res = await server.inject({
    method: "POST",
    url: "/audio/sightings/upload",
    headers: { "content-type": contentType, authorization: `Bearer ${token}` },
    payload: body,
  });
  const elapsedMs = performance.now() - t0;
  if (res.statusCode !== 200) throw new Error(`업로드 실패(전제 조건 깨짐): ${res.statusCode} ${res.body}`);
  return { sightingId: res.json().audio_sighting_id as string, elapsedMs };
}

async function identify(server: FastifyInstance, token: string, sightingId: string) {
  const t0 = performance.now();
  const res = await server.inject({
    method: "POST",
    url: "/audio/identify",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    payload: { audio_sighting_id: sightingId },
  });
  const elapsedMs = performance.now() - t0;
  return { statusCode: res.statusCode, elapsedMs };
}

async function main() {
  const cfg = loadConfig();
  if (!cfg.database.url) throw new Error("DATABASE_URL이 비어 있음 — SSH 터널(5433)을 여세요.");
  if (!cfg.audio.model.endpoint) throw new Error("AUDIO_MODEL_SERVICE_URL이 비어 있음 — CAMP-3 터널(8932)을 여세요.");

  console.log(`[perf] DB=${cfg.database.url.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[perf] model=${cfg.audio.model.endpoint}`);

  const app = await buildApp(cfg);
  const server = await buildHttpServer(app);
  const token = await signup(server);

  console.log("[perf] 10초 오디오(chirp) 생성 중...");
  const audio10s = await makeRealAudio({ seconds: 10, format: "wav" });
  console.log(`[perf] 오디오 준비 완료: ${audio10s.length} bytes`);

  // ── 1) 순차 단일요청: 업로드(변환 포함) vs identify(순수 모델 왕복) ──
  const N = 10;
  console.log(`\n[perf] 1) 순차 ${N}회 — 업로드(ffmpeg 변환 포함) vs identify(모델 추론만)`);
  const uploadMs: number[] = [];
  const identifyMs: number[] = [];
  const sightingIdsForConcurrency: string[] = [];
  for (let i = 0; i < N; i++) {
    const { sightingId, elapsedMs: up } = await upload(server, token, audio10s);
    uploadMs.push(up);
    const { statusCode, elapsedMs: id } = await identify(server, token, sightingId);
    if (statusCode !== 200) throw new Error(`identify 실패(전제 조건 깨짐): ${statusCode}`);
    identifyMs.push(id);
    if (i < 8) sightingIdsForConcurrency.push(sightingId); // 2)에서 재사용(새로 업로드 안 함)
    process.stdout.write(".");
  }
  console.log("");
  summarize("업로드(변환 포함, ffmpeg 10초 입력)", uploadMs);
  summarize("identify(모델 추론 왕복만, 변환 이미 끝남)", identifyMs);

  // ── 2) 동시 요청: CAMP-3 세마포어(cap=4, Stage2 STAGE2_MODEL_SERVICE.md) 초과분 확인 ──
  console.log(`\n[perf] 2) 동시 identify ${sightingIdsForConcurrency.length}건 (Promise.all)`);
  const memBefore = process.memoryUsage();
  const concurrentStart = performance.now();
  const results = await Promise.all(
    sightingIdsForConcurrency.map((sid) => identify(server, token, sid)),
  );
  const concurrentWallMs = performance.now() - concurrentStart;
  const memAfter = process.memoryUsage();
  const byStatus = new Map<number, number>();
  for (const r of results) byStatus.set(r.statusCode, (byStatus.get(r.statusCode) ?? 0) + 1);
  console.log(`  전체 벽시계 시간: ${concurrentWallMs.toFixed(1)}ms`);
  console.log(`  상태코드 분포: ${[...byStatus.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`);
  summarize("동시 요청 중 개별 identify 지연", results.map((r) => r.elapsedMs));
  console.log(
    `  Node 프로세스 RSS: 이전=${(memBefore.rss / 1024 / 1024).toFixed(1)}MB → ` +
      `이후=${(memAfter.rss / 1024 / 1024).toFixed(1)}MB`,
  );

  // ── 3) 정리: 이 스크립트가 만든 테스트 유저/오디오 전부 삭제 ──
  console.log("\n[perf] 정리: DELETE /account로 테스트 데이터 삭제 중...");
  const eraseRes = await server.inject({
    method: "DELETE",
    url: "/account",
    headers: { authorization: `Bearer ${token}` },
  });
  console.log(`  DELETE /account → ${eraseRes.statusCode}`);

  await server.close();
  if (app.dbPool) await app.dbPool.end();
  console.log("\n[perf] 완료.");
}

main().catch((err) => {
  console.error("[perf] 실패:", err);
  process.exit(1);
});
