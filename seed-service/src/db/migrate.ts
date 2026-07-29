/**
 * 마이그레이션 러너 v2. `db/migrations/*.sql`을 파일명(번호) 순서대로, 아직 적용 안 된
 * 파일만 하나씩 실행한다. `schema_migrations` 테이블(0001_baseline.sql이 만듦)이 "무엇을
 * 이미 적용했는지"의 단일 진실 원천이다.
 *
 * `db/schema.sql`은 더 이상 이 러너가 실행하지 않는다 — 이미 실데이터가 있는 공유 DB에는
 * 안전하지 않다(CREATE TABLE에 IF NOT EXISTS가 없어 재실행하면 실패). schema.sql은 이제
 * "완전히 새 DB를 처음부터 세팅할 때"의 스냅샷 참고 문서 역할만 한다. 이후 모든 스키마
 * 변경은 이 폴더에 새 번호 파일을 추가하는 방식으로만 한다(db/migrations/0001_baseline.sql
 * 상단 주석 참고).
 *
 * 개발 머신이 Windows라 `psql` 클라이언트 설치를 전제하지 않도록 `pg`로 직접 실행한다.
 * 각 마이그레이션 파일은 자기 자신의 BEGIN/COMMIT을 포함하므로, 여기서 추가로 트랜잭션을
 * 씌우지 않는다 — 실패하면 그 파일 내부의 트랜잭션만 롤백되고, 이미 적용된 이전 파일들은
 * 그대로 유지된다.
 *
 * 실행: npm run db:migrate (DATABASE_URL이 .env에 있어야 함, 실행 전 SSH 터널 필요)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../db/migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("[migrate] DATABASE_URL이 비어 있습니다. .env를 확인하세요.");
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    throw new Error(`[migrate] ${migrationsDir}에 .sql 파일이 없습니다.`);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // 0001_baseline.sql이 schema_migrations 자체를 만들기 전(첫 실행)에는 이 조회가
    // 실패한다 — 그 경우 "아직 아무것도 적용 안 됨"으로 보고 계속 진행한다.
    let applied = new Set<string>();
    try {
      const r = await client.query(`SELECT id FROM schema_migrations`);
      applied = new Set(r.rows.map((row) => row.id as string));
    } catch {
      applied = new Set();
    }

    let appliedCount = 0;
    for (const file of files) {
      const id = file.replace(/\.sql$/, "");
      if (applied.has(id)) {
        console.log(`[migrate] ${id} — 이미 적용됨, 건너뜀`);
        continue;
      }
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`[migrate] ${id} 적용 중...`);
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [id],
      );
      console.log(`[migrate] ${id} 완료`);
      appliedCount++;
    }
    console.log(`[migrate] 전부 완료. 이번에 새로 적용한 파일: ${appliedCount}개.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] 실패:", err);
  process.exit(1);
});
