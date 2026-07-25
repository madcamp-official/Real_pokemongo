/**
 * 실행 진입점(C단계). `npm run serve`로 실제 HTTP 서버를 띄운다.
 *
 * `src/demo.ts`(라이브러리 직접 호출 데모)와는 별개 — 이쪽은 `app/`이 실제로 접속할
 * 네트워크 서버다.
 */
import { loadConfig, assertProductionConfig } from "./config/index.js";
import { buildApp } from "./composition.js";
import { buildHttpServer } from "./http/server.js";

async function main() {
  const config = loadConfig();
  assertProductionConfig(config); // 프로덕션인데 필수값 비어있으면 여기서 즉시 실패(조용히 안 넘어감)

  const app = await buildApp(config);
  const server = await buildHttpServer(app);

  await server.listen({ port: config.http.port, host: config.http.host });
  console.log(`API 서버가 http://${config.http.host}:${config.http.port} 에서 시작되었습니다.`);
  console.log(
    `동정 모드: ${app.config.identification.bioclip.endpoint ? "BioCLIP(실제 GPU 서버)" : "Mock(개발)"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
