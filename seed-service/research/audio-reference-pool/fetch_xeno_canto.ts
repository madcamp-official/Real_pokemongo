/**
 * Xeno-canto에서 참조 음원 후보를 조회해 라이선스로 거른 뒤 clips.csv에 채워 넣는다.
 *
 * 이 스크립트는 런타임 코드가 아니다(seed-service/src/ 밖) — 8단계(참조 음원과 유사도)
 * 준비를 위한 1회성 콘텐츠 조사 도구다. 실제 오디오 바이트는 이 리포에 커밋하지 않는다
 * (downloads/는 .gitignore 대상).
 *
 * 실행 전 필요:
 *   - .env에 XENO_CANTO_API_KEY (xeno-canto.org 계정 > Account 페이지에서 발급, 에이전트가
 *     대신 가입/발급할 수 없음 — README.md 참고)
 *
 * 실행:
 *   npx tsx research/audio-reference-pool/fetch_xeno_canto.ts            # 전체 18종
 *   npx tsx research/audio-reference-pool/fetch_xeno_canto.ts "Pica serica"  # 한 종만
 *
 * 한 일:
 *   1) species_manifest.csv의 각 종을 sp:"학명"으로 조회.
 *   2) 응답의 lic 필드를 정규화해 CC0/CC-BY/CC-BY-SA만 통과시킨다(NC/ND는 전부 제외).
 *   3) 통과한 후보를 downloads/<taxon_id>.json(원본 응답 캐시)과 clips.csv(사람이 검토할
 *      표)에 기록한다. 오디오 파일 자체는 내려받지 않는다 — 사람이 직접 들어보고
 *      quality_status를 채운 뒤, 승인된 것만 나중에 CAMP-3로 옮긴다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(__dirname, "species_manifest.csv");
const downloadsDir = path.join(__dirname, "downloads");
const clipsCsvPath = path.join(__dirname, "clips.csv");

const API_BASE = "https://xeno-canto.org/api/3/recordings";
// 정책(README.md "라이선스 정책", 2026-07-28 개정): CC0 / CC-BY / CC-BY-SA / CC-BY-NC /
// CC-BY-NC-SA를 채택한다. ND(2차 저작물 금지)만 계속 제외 — 표준 PCM 변환 파이프라인
// 자체가 2차적저작물 소지가 있어 라이선스 종류와 무관하게 위험하다고 보기 때문.
// NC(비영리 전용)는 앱이 지금 비영리로 확정돼(DECISIONS.md 2026-07-28) 포함시켰다 —
// 앱이 나중에 상업적 성격을 띠면 NC로 수집한 클립은 전부 다시 정리해야 한다
// (species_manifest.csv의 license 컬럼으로 NC 클립을 구분할 수 있게 원본 URL을 그대로 남김).
// 허용 코드(Creative Commons URL 경로 세그먼트 기준, 실제 API 응답으로 확인함 — "cc-by"가
// 아니라 그냥 "by"): by, by-sa, by-nc, by-nc-sa. CC0는 /publicdomain/zero/ 경로로 따로 옴.
const ALLOWED_LICENSE_CODES = new Set(["by", "by-sa", "by-nc", "by-nc-sa"]);

interface ManifestRow {
  taxon_id: string;
  kor_name: string;
  sci_name: string;
}

interface XcRecording {
  id: string;
  gen: string;
  sp: string;
  en?: string;
  rec?: string;
  cnt?: string;
  loc?: string;
  lic?: string;
  file?: string;
  length?: string;
  date?: string;
  q?: string; // quality rating, A(최고)~E
}

function parseManifest(csv: string): ManifestRow[] {
  const lines = csv.trim().split("\n").slice(1); // 헤더 제외
  return lines.map((line) => {
    const cols = line.split(",");
    return { taxon_id: cols[0]!, kor_name: cols[1]!, sci_name: cols[2]! };
  });
}

/**
 * lic 필드는 실제로 "https://creativecommons.org/licenses/<code>/<version>/" 또는
 * CC0의 경우 ".../publicdomain/zero/1.0/" 형태의 완전한 URL이다(2026-07-28, 실제 API
 * 응답으로 검증함 — 이전에 "cc-by" 같은 접두어를 기대한 건 틀린 가정이었다. <code>는
 * by / by-sa / by-nc / by-nc-sa / by-nc-nd / by-nd 중 하나).
 */
function normalizeIsAllowedLicense(lic: string | undefined): boolean {
  if (!lic) return false; // 라이선스 불명 = 채택 안 함(안전 기본값)
  const url = lic.toLowerCase();
  if (url.includes("/publicdomain/zero/")) return true; // CC0
  const match = url.match(/\/licenses\/([a-z-]+)\//);
  if (!match) return false;
  return ALLOWED_LICENSE_CODES.has(match[1]!);
}

async function fetchSpecies(row: ManifestRow, apiKey: string): Promise<XcRecording[]> {
  const query = encodeURIComponent(`sp:"${row.sci_name}"`);
  const url = `${API_BASE}?query=${query}&key=${apiKey}&per_page=100`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[${row.sci_name}] Xeno-canto 응답 오류 ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { recordings?: XcRecording[]; numRecordings?: string };
  return data.recordings ?? [];
}

async function main() {
  const apiKey = process.env.XENO_CANTO_API_KEY;
  if (!apiKey) {
    console.error(
      "[fetch_xeno_canto] XENO_CANTO_API_KEY가 없습니다. xeno-canto.org 계정을 만들고 " +
        "Account 페이지에서 키를 발급받아 .env에 채운 뒤 다시 실행하세요. (README.md 참고)",
    );
    process.exit(1);
  }

  const filterSciName = process.argv[2];
  const manifest = parseManifest(readFileSync(manifestPath, "utf8")).filter(
    (r) => !filterSciName || r.sci_name === filterSciName,
  );
  if (manifest.length === 0) {
    console.error(`[fetch_xeno_canto] 대상 종을 찾지 못했습니다: ${filterSciName}`);
    process.exit(1);
  }

  if (!existsSync(downloadsDir)) mkdirSync(downloadsDir, { recursive: true });

  const clipRows: string[] = [
    "taxon_id,call_type,region,season,source_url,creator,license,attribution,quality_status,reference_set_version,embedding_model_version,xc_id,duration",
  ];

  for (const row of manifest) {
    console.log(`[fetch_xeno_canto] ${row.kor_name}(${row.sci_name}) 조회 중...`);
    let recordings: XcRecording[];
    try {
      recordings = await fetchSpecies(row, apiKey);
    } catch (err) {
      console.error(`[fetch_xeno_canto] ${row.sci_name} 조회 실패:`, err);
      continue;
    }

    writeFileSync(
      path.join(downloadsDir, `${row.taxon_id}.raw.json`),
      JSON.stringify(recordings, null, 2),
      "utf8",
    );

    const allowed = recordings.filter((r) => normalizeIsAllowedLicense(r.lic));
    console.log(
      `[fetch_xeno_canto] ${row.kor_name}: 전체 ${recordings.length}건 중 라이선스 통과 ${allowed.length}건`,
    );

    for (const rec of allowed) {
      const attribution = `${rec.rec ?? "unknown"} via xeno-canto.org (XC${rec.id}), ${rec.lic ?? ""}`;
      clipRows.push(
        [
          row.taxon_id,
          "call", // call_type: 기본값 — 사람이 실제로 듣고 song/call 등으로 재분류
          rec.cnt ?? "",
          "", // season: xeno-canto date로부터 사람이 판단해 채움
          rec.file ?? "",
          rec.rec ?? "",
          rec.lic ?? "",
          `"${attribution}"`,
          "pending", // quality_status: 사람이 들어보고 approved/rejected로 변경
          "v1",
          "", // embedding_model_version: 8단계에서 실제 임베딩 낼 때 채움
          rec.id,
          rec.length ?? "",
        ].join(","),
      );
    }

    // Xeno-canto 예의(rate limit 1000/h 대비 여유): 요청 사이 짧게 쉼.
    await new Promise((r) => setTimeout(r, 500));
  }

  writeFileSync(clipsCsvPath, clipRows.join("\n") + "\n", "utf8");
  console.log(`[fetch_xeno_canto] 완료. ${clipsCsvPath}에 ${clipRows.length - 1}개 후보 기록됨.`);
  console.log("[fetch_xeno_canto] 다음 단계: 사람이 각 후보를 들어보고 quality_status를 채운다.");
}

main().catch((err) => {
  console.error("[fetch_xeno_canto] 실패:", err);
  process.exit(1);
});
