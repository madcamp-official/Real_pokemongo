/**
 * 데모 — 명세서 §2.2 "골든 패스"를 코드로 재현한다.
 *
 * 실행: npm run demo  (외부 API 키 없이 MockProvider 로 전체 파이프라인이 돈다)
 *
 * 시연 내용:
 *   1) 보호자 계정 + 자녀 프로필 생성(동의, 위치 기본 OFF)
 *   2) 민들레 관찰(고확신) → 도감 해금 + 봄 퀘스트 1/3 + 첫 발견 배지
 *   3) 개나리 관찰 → 봄 퀘스트 2/3
 *   4) 꿀벌 관찰 → 안전 안내가 종 정보보다 먼저 노출됨(F4)
 *   5) 보호자 대시보드 요약
 */
import { buildApp } from "./composition.js";
import type { TaxonGroup } from "./core/domain/types.js";
import { makeCleanJpeg } from "./core/media/fixtures.js";

const img = () => [makeCleanJpeg()]; // 원시 이미지(플로우가 정화). 유효 JPEG 픽스처.

async function main() {
  const app = await buildApp();

  console.log("=== 『씨앗(SEED)』 골든 패스 데모 ===\n");
  console.log(
    `동정 모드: ${
      app.config.identification.plantId.apiKey ? "Plant.id(실제)" : "Mock(개발)"
    }\n`,
  );

  // 1) 계정/프로필
  const guardian = await app.accounts.createGuardian("free");
  // 인증 컨텍스트: 실제 서비스에선 인증 계층(토큰 검증)이 발급한다. 데모에선 직접 생성.
  const ctx = { guardianId: guardian.id };
  const child = await app.accounts.createChild(ctx, {
    nickname: "하준",
    ageBand: "child",
    avatar: "fox",
    legalGuardianConsent: true, // 동의 없으면 생성 불가
  });
  console.log(`👦 자녀 프로필 생성: ${child.nickname} (Lv.${child.level})`);
  console.log(`🔒 위치 저장 기본값: ${guardian.locationStorageEnabled ? "ON" : "OFF"}\n`);

  // 관찰 헬퍼: Mock 시나리오를 주입한 뒤 flow.observe 호출
  async function observe(
    label: string,
    scenario: { sci: string; kor?: string; conf: number },
    groupHint: TaxonGroup,
  ) {
    app.mock.enqueue([
      { scientificName: scenario.sci, vernacularName: scenario.kor, rank: "species", confidence: scenario.conf },
    ]);
    const res = await app.flow.observe(ctx, {
      childId: child.id,
      images: img(),
      media: [],
      groupHint,
      // rawCoord 를 줘도 위치 저장이 OFF 라 저장되지 않음(프라이버시).
      rawCoord: { lat: 37.5, lng: 127.0 },
    });
    console.log(`📸 [${label}] → ${res.identification.childMessage}`);
    if (res.safety?.showFirst) {
      console.log(`   ⚠️  안전 안내(우선): ${res.safety.message}`);
    }
    if (res.recorded) {
      const r = res.recorded;
      console.log(
        `   도감 ${(r.collectionRatio * 100).toFixed(0)}% · +${r.xpGained}XP` +
          (r.newLevel ? ` · 레벨업 Lv.${r.newLevel}!` : "") +
          (r.newBadgeTitles.length ? ` · 배지: ${r.newBadgeTitles.join(", ")}` : "") +
          (r.completedQuestTitles.length
            ? ` · 퀘스트완료: ${r.completedQuestTitles.join(", ")}`
            : ""),
      );
    }
    console.log("");
  }

  // 2~4) 관찰들
  await observe("민들레", { sci: "Taraxacum officinale", kor: "민들레", conf: 0.93 }, "plant");
  await observe("개나리", { sci: "Forsythia koreana", kor: "개나리", conf: 0.9 }, "plant");
  await observe("꿀벌", { sci: "Apis mellifera", kor: "꿀벌", conf: 0.88 }, "insect");
  await observe("무당벌레", { sci: "Harmonia axyridis", kor: "무당벌레", conf: 0.91 }, "insect");
  await observe("배추흰나비", { sci: "Pieris rapae", kor: "배추흰나비", conf: 0.9 }, "insect");

  // 저확신 사례: 상위 분류 폴백/모르겠어요
  app.mock.enqueue([
    { scientificName: "Poaceae", rank: "family", confidence: 0.5 },
    { scientificName: "Unknown", rank: "species", confidence: 0.2 },
  ]);
  const lowConf = await app.flow.observe(ctx, {
    childId: child.id,
    images: img(),
    media: [],
    groupHint: "plant",
  });
  console.log(`📸 [정체불명 풀] → ${lowConf.identification.childMessage}`);
  console.log(`   (tier=${lowConf.identification.tier}, 도감/퀘스트 반영 안 됨)\n`);

  // 5) 보호자 대시보드 (인증된 본인 것만 — IDOR 차단)
  const view = await app.dashboard.build(ctx);
  console.log("=== 👪 보호자 대시보드(이번 주) ===");
  for (const s of view.children) {
    console.log(
      `- ${s.nickname} (Lv.${s.level}): 관찰 ${s.observationsThisWeek}건, ` +
        `서로 다른 종 ${s.distinctSpeciesThisWeek}, 배지 ${s.badgesTotal}개`,
    );
    console.log(`  분류군: ${JSON.stringify(s.groupBreakdown)}`);
    console.log(`  교육과정 연계: ${JSON.stringify(s.curriculumProgress)}`);
  }
  console.log(`\n🔒 위치 저장 상태: ${view.locationStorageEnabled ? "ON" : "OFF"} (기본 OFF)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
