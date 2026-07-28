/**
 * 8단계 참조 음원 적재 — `research/audio-reference-pool/clips.csv`에서 사람이 이미 실제로
 * 들어보고 `quality_status`를 `approved`로 바꾼 행만 골라, 실제로 다운로드→변환→임베딩
 * 계산까지 끝내 `species_sound_reference`에 적재한다.
 *
 * `research/audio-reference-pool/`(콘텐츠 조사 폴더, 런타임 코드 아님)이 아니라 여기
 * `src/scripts/`에 둔 이유: 이 스크립트는 실제 프로덕션 데이터 파이프라인(사람이 트리거)
 * 이라 `AudioConverter`/`ReferenceMediaStore`/`PgSpeciesSoundReferenceRepo` 등 타입 검사가
 * 되는 실제 런타임 코드를 그대로 재사용해야 한다 — `npm run typecheck`(`tsconfig.json`
 * `include: ["src/**\/*.ts"]`) 대상에 포함시키기 위함이다.
 *
 * **2026-07-28 기준 실행하면 반드시 "적재할 행이 없습니다"로 끝난다** — clips.csv의
 * 1236개 후보가 전부 `pending`이다(사람이 들어보는 검수는 에이전트가 대신할 수 없음,
 * README.md 참고). 이 스크립트는 실행 준비만 끝내둔 상태다(fetch_xeno_canto.ts와 같은
 * "shovel-ready" 성격) — 사람이 clips.csv를 편집해 일부를 approved로 바꾼 뒤에야
 * 실제로 뭔가를 적재한다. 재실행해도 안전하다(같은 id면 upsert로 덮어씀, ON CONFLICT).
 *
 * 실행 전 필요:
 *   - DATABASE_URL(.env, SSH 터널)
 *   - AUDIO_MODEL_SERVICE_URL(.env, 같은 CAMP-3 터널) — 임베딩 계산에 필요
 *
 * 실행: npx tsx src/scripts/ingestApprovedReferenceClips.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PgTaxonRepo, PgSpeciesSoundReferenceRepo } from "../core/repositories/postgres/PostgresRepositories.js";
import { AudioConverter } from "../core/audio/AudioConverter.js";
import { ReferenceMediaStore } from "../core/audio/reference/ReferenceMediaStore.js";
import { ReferenceEmbeddingStore } from "../core/audio/reference/ReferenceEmbeddingStore.js";
import { BirdNetEmbeddingProvider } from "../core/audio/similarity/BirdNetEmbeddingProvider.js";
import { meanPool } from "../core/audio/similarity/vectorMath.js";
import { loadConfig } from "../config/index.js";
import { asTaxonId } from "../core/domain/ids.js";
import type { SpeciesSoundReference } from "../core/audio/reference/referenceTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clipsCsvPath = path.resolve(__dirname, "../../research/audio-reference-pool/clips.csv");

interface ClipRow {
  taxonId: string;
  callType: string;
  sourceUrl: string;
  creator: string;
  license: string;
  attribution: string;
  qualityStatus: string;
  referenceSetVersion: string;
  xcId: string;
  duration: string;
}

/**
 * RFC4180 최소 구현. `attribution` 필드가 따옴표로 감싼 콤마 포함 문자열이라
 * (`fetch_xeno_canto.ts` 참고) 단순 `split(",")`로는 열이 밀린다 — 재적재 정확성이
 * 중요해 제대로 된 파서를 쓴다.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // no-op — 바로 뒤 \n이 처리한다.
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** xeno-canto의 "0:49"(분:초) 표기를 ms로. 못 읽으면 0(호출부가 실측값으로 대체). */
function parseDurationToMs(duration: string): number {
  const parts = duration.split(":").map(Number);
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
    return (parts[0]! * 60 + parts[1]!) * 1000;
  }
  return 0;
}

function readApprovedRows(): ClipRow[] {
  const rows = parseCsv(readFileSync(clipsCsvPath, "utf8").trim());
  const header = rows[0]!;
  const col = (name: string) => header.indexOf(name);
  const idx = {
    taxonId: col("taxon_id"),
    callType: col("call_type"),
    sourceUrl: col("source_url"),
    creator: col("creator"),
    license: col("license"),
    attribution: col("attribution"),
    qualityStatus: col("quality_status"),
    referenceSetVersion: col("reference_set_version"),
    xcId: col("xc_id"),
    duration: col("duration"),
  };

  return rows
    .slice(1)
    .map((cols): ClipRow => ({
      taxonId: cols[idx.taxonId] ?? "",
      callType: cols[idx.callType] || "call",
      sourceUrl: cols[idx.sourceUrl] ?? "",
      creator: cols[idx.creator] ?? "",
      license: cols[idx.license] ?? "",
      attribution: cols[idx.attribution] ?? "",
      qualityStatus: cols[idx.qualityStatus] ?? "pending",
      referenceSetVersion: cols[idx.referenceSetVersion] || "v1",
      xcId: cols[idx.xcId] ?? "",
      duration: cols[idx.duration] ?? "",
    }))
    .filter((r) => r.qualityStatus === "approved");
}

async function main() {
  // CSV 확인이 먼저다 — 할 일이 없으면(지금 상태) DB/모델 서비스 연결을 요구하지 않고
  // 바로 끝낸다(빈 clips.csv 상태에서도 이 스크립트가 안전하게 실행되는지 그대로 검증 가능).
  const approved = readApprovedRows();
  console.log(`[ingest] clips.csv에서 approved 행 ${approved.length}건을 찾았습니다.`);
  if (approved.length === 0) {
    console.log(
      "[ingest] 적재할 행이 없습니다 — 사람이 clips.csv의 quality_status를 approved로 바꿔야 " +
        "다음 실행에서 뭔가 적재됩니다(README.md 참고, 이 단계는 자동화할 수 없습니다).",
    );
    return;
  }

  const cfg = loadConfig();
  if (!cfg.database.url) {
    throw new Error("[ingest] DATABASE_URL이 비어 있습니다. .env를 확인하고 SSH 터널을 여세요.");
  }
  if (!cfg.audio.model.endpoint) {
    throw new Error(
      "[ingest] AUDIO_MODEL_SERVICE_URL이 비어 있습니다 — 임베딩 계산에 CAMP-3 모델 서비스가 필요합니다.",
    );
  }

  const pool = new pg.Pool({ connectionString: cfg.database.url });
  const taxa = new PgTaxonRepo(pool);
  const references = new PgSpeciesSoundReferenceRepo(pool);
  // 참조 클립은 사용자 녹음(최대 15초, config.audio.maxDurationSeconds)과 다른 정책이다 —
  // 원곡 길이를 그대로 허용해야 하므로 여기서만 넉넉한 상한을 준다.
  const converter = new AudioConverter({
    tempDir: cfg.audio.tempDir,
    maxDurationSeconds: 120,
    timeoutMs: 30_000,
  });
  const mediaStore = new ReferenceMediaStore(`${cfg.audio.referenceDir}/media`);
  const embeddingStore = new ReferenceEmbeddingStore(`${cfg.audio.referenceDir}/embeddings`);
  const embeddingProvider = new BirdNetEmbeddingProvider(cfg.audio.model);

  const seqByTaxon = new Map<string, number>();
  let succeeded = 0;
  let failed = 0;

  for (const row of approved) {
    const taxonId = asTaxonId(row.taxonId);
    const taxon = await taxa.get(taxonId);
    if (!taxon) {
      console.warn(`[ingest] 건너뜀: ${row.taxonId}가 taxon 마스터에 없음(xc_id=${row.xcId})`);
      failed++;
      continue;
    }

    try {
      console.log(`[ingest] ${taxon.korName}(xc_id=${row.xcId}) 다운로드 중...`);
      const res = await fetch(row.sourceUrl);
      if (!res.ok) throw new Error(`다운로드 실패 ${res.status}`);
      const original = Buffer.from(await res.arrayBuffer());

      const converted = await converter.convertToMonoPcmWav(original);
      const mediaRef = await mediaStore.save(converted.wavBytes);

      const embeddingResult = await embeddingProvider.embed(converted.wavBytes);
      const embedding = meanPool(embeddingResult.segments.map((s) => s.embedding));
      const embeddingRef = await embeddingStore.save(embedding);

      const seq = (seqByTaxon.get(row.taxonId) ?? 0) + 1;
      seqByTaxon.set(row.taxonId, seq);
      const slug = row.taxonId.replace(/^taxon-/, "");
      const id = `ref-${slug}-${String(seq).padStart(3, "0")}`;

      const ref: SpeciesSoundReference = {
        id,
        taxonId,
        mediaRef,
        callType: row.callType,
        durationMs: parseDurationToMs(row.duration) || converted.durationMs,
        sourceUrl: row.sourceUrl,
        creator: row.creator,
        license: row.license,
        attribution: row.attribution,
        qualityStatus: "approved",
        referenceSetVersion: row.referenceSetVersion,
        embeddingRef,
        embeddingModelVersion: embeddingResult.modelVersion,
      };
      await references.upsertMany([ref]);
      succeeded++;
      console.log(`[ingest] 적재 완료: ${id}`);
    } catch (err) {
      failed++;
      console.error(`[ingest] 실패(xc_id=${row.xcId}):`, (err as Error).message);
    }
  }

  console.log(`[ingest] 완료. 성공 ${succeeded}건, 실패 ${failed}건.`);
  await pool.end();
}

main().catch((err) => {
  console.error("[ingest] 실패:", err);
  process.exit(1);
});
