/**
 * 마이그레이션 러너. `db/schema.sql`을 통째로 읽어 `DATABASE_URL`에 실행한다.
 *
 * 개발 머신이 Windows라 `psql` 클라이언트 설치를 전제하지 않도록 `pg`로 직접 실행한다.
 * 스크립트 자체가 이미 BEGIN/COMMIT을 감싸고 있으므로(db/schema.sql), 여기서 추가로
 * 트랜잭션을 씌우지 않는다 — 실패하면 파일 내부의 트랜잭션이 그대로 롤백된다.
 *
 * 실행: npm run db:migrate (DATABASE_URL이 .env에 있어야 함, 실행 전 SSH 터널 필요)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../db/schema.sql");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("[migrate] DATABASE_URL이 비어 있습니다. .env를 확인하세요.");
  }

  const sql = readFileSync(schemaPath, "utf8");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    console.log(`[migrate] ${schemaPath} 실행 중...`);
    await client.query(sql);
    console.log("[migrate] 완료.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] 실패:", err);
  process.exit(1);
});
