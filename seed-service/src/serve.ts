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
  console.log(`저장소: ${app.dbPool ? "PostgreSQL(실DB)" : "InMemory(개발용, 재시작 시 소실)"}`);

  // 5단계: 오디오 세션 TTL 스윕. 실제 프로세스 부팅 경로에서만 시작한다(buildApp() 자체는
  // 시작하지 않음 — composition.ts/AudioSessionCleanupService.ts 주석 참고, 테스트가
  // buildApp()을 여러 번 호출해도 백그라운드 타이머가 쌓이지 않도록 하기 위함).
  app.audioCleanup.start(config.audio.cleanupIntervalMs);
  console.log(`오디오 TTL 스윕: ${config.audio.cleanupIntervalMs}ms마다 실행`);

  // DB 커넥션 풀을 쓰는 경우, 종료 시그널에 정상적으로 풀을 닫는다(터널이 끊겨도 프로세스가
  // 좀비 커넥션을 붙들고 있지 않도록).
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} 수신 — 서버를 종료합니다.`);
    app.audioCleanup.stop();
    await server.close();
    if (app.dbPool) await app.dbPool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
