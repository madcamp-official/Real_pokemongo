/**
 * SEED_TAXA를 JSON으로 내보내는 유틸리티.
 *
 * 목적: GPU 서버의 BioCLIP 후보목록(closed-set) 분류기가 사용할 종 목록을,
 * seedData.ts를 손으로 다시 옮겨 적지 않고 이 파일에서 그대로 직렬화해서 넘긴다.
 * (수작업 복사는 원본과 조용히 어긋날 위험이 있어 의도적으로 피한다 — 항상
 * 이 스크립트를 다시 실행해서 최신 seedData.ts 기준 JSON을 재생성할 것.)
 *
 * 실행: npx tsx src/seed/exportTaxa.ts > /path/to/seed_taxa_export.json
 */
import { SEED_TAXA } from "./seedData.js";

console.log(JSON.stringify(SEED_TAXA, null, 2));
