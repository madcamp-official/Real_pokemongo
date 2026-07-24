/**
 * 골든 테스트: 동정 게이트웨이 (체크리스트 §4.4 + §4.1 안전 우선순위).
 *
 * 검증:
 *  - high/medium/unknown 분기와 아이용 메시지.
 *  - 위험 종은 종 정보보다 안전 안내가 먼저(childMessage == 안전 문구).
 *  - 상위 분류 폴백(§7): low 확신 + parentId 있으면 "○○ 종류예요"로 물러남.
 *    (이전엔 도달 불가능한 죽은 코드였던 경로 — 회귀 방지)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { IdentificationGateway } from "./IdentificationGateway.js";
import { MockProvider } from "./providers/MockProvider.js";
import { InMemoryTaxonRepo } from "../repositories/memory/InMemoryRepositories.js";
import type { Taxon, TaxonRank, RiskTag, TaxonGroup } from "../domain/types.js";
import { asTaxonId } from "../domain/ids.js";
import { sanitizeImage } from "../media/MediaSanitizer.js";
import { makeCleanJpeg } from "../media/fixtures.js";

// 게이트웨이는 SanitizedImage 만 받는다(EXIF 강제). 내용은 무관하므로 정화된 픽스처 사용.
const IMG = [sanitizeImage(makeCleanJpeg()).image];

function taxon(o: {
  id: string;
  sciName: string;
  korName?: string;
  rank?: TaxonRank;
  group?: TaxonGroup;
  riskTags?: RiskTag[];
  parentId?: string;
}): Taxon {
  return {
    id: asTaxonId(o.id),
    sciName: o.sciName,
    korName: o.korName ?? "종",
    rank: o.rank ?? "species",
    group: o.group ?? "plant",
    seasonTags: [],
    habitatTags: [],
    riskTags: o.riskTags ?? [],
    rarity: "common",
    parentId: o.parentId ? asTaxonId(o.parentId) : undefined,
  };
}

async function makeGateway(taxa: Taxon[]) {
  const repo = new InMemoryTaxonRepo();
  await repo.upsertMany(taxa);
  const mock = new MockProvider();
  const gateway = new IdentificationGateway([mock], repo);
  return { gateway, mock, repo };
}

test("high 확신: 종을 단정하고 국명으로 안내한다", async () => {
  const { gateway, mock } = await makeGateway([
    taxon({ id: "dandelion", sciName: "Taraxacum officinale", korName: "민들레" }),
  ]);
  mock.enqueue([
    { scientificName: "Taraxacum officinale", rank: "species", confidence: 0.93 },
  ]);
  const out = await gateway.identify({ images: IMG, groupHint: "plant" });
  assert.equal(out.tier, "high");
  assert.equal(out.top?.displayName, "민들레");
  assert.match(out.childMessage, /민들레/);
});

test("위험 종은 종 정보보다 안전 안내가 먼저 나온다(childMessage == 안전 문구)", async () => {
  const { gateway, mock } = await makeGateway([
    taxon({
      id: "bee",
      sciName: "Apis mellifera",
      korName: "꿀벌",
      group: "insect",
      riskTags: ["sting_or_bite"],
    }),
  ]);
  mock.enqueue([
    { scientificName: "Apis mellifera", rank: "species", confidence: 0.9 },
  ]);
  const out = await gateway.identify({ images: IMG, groupHint: "insect" });
  assert.equal(out.tier, "high");
  assert.ok(out.safety, "안전 안내가 있어야 함");
  assert.equal(out.safety!.showFirst, true);
  // 아이에게 보이는 첫 메시지가 '확신해요'가 아니라 안전 문구여야 한다.
  assert.equal(out.childMessage, out.safety!.message);
  assert.doesNotMatch(out.childMessage, /확신해요/);
});

test("medium 확신: 후보를 골라보라고 안내한다(단정하지 않음)", async () => {
  const { gateway, mock } = await makeGateway([
    taxon({ id: "a", sciName: "Aaa aaa", korName: "가나비" }),
    taxon({ id: "b", sciName: "Bbb bbb", korName: "나나비" }),
  ]);
  mock.enqueue([
    { scientificName: "Aaa aaa", rank: "species", confidence: 0.72 },
    { scientificName: "Bbb bbb", rank: "species", confidence: 0.66 },
  ]);
  const out = await gateway.identify({ images: IMG, groupHint: "plant" });
  assert.equal(out.tier, "medium");
  assert.ok(out.candidates.length >= 2);
});

test("상위 분류 폴백: low 확신 + parentId 있으면 '○○ 종류예요'로 물러난다", async () => {
  const parent = taxon({
    id: "genus-taraxacum",
    sciName: "Taraxacum",
    korName: "민들레속",
    rank: "genus",
  });
  const species = taxon({
    id: "some-dandelion",
    sciName: "Taraxacum mongolicum",
    korName: "몽고민들레",
    parentId: parent.id,
  });
  const { gateway, mock } = await makeGateway([parent, species]);
  mock.enqueue([
    // low 구간(0.35~0.6) 확신 — 종을 단정하기엔 부족.
    { scientificName: "Taraxacum mongolicum", rank: "species", confidence: 0.45 },
  ]);
  const out = await gateway.identify({ images: IMG, groupHint: "plant" });
  assert.equal(out.tier, "fallback");
  assert.equal(out.top?.displayName, "민들레속");
  assert.match(out.childMessage, /종류/);
});

test("unknown 확신: 좌절 없이 재촬영을 안내하고, 도감/퀘스트 반영 없음", async () => {
  const { gateway, mock } = await makeGateway([]);
  mock.enqueue([{ scientificName: "Nothing", rank: "species", confidence: 0.2 }]);
  const out = await gateway.identify({ images: IMG, groupHint: "plant" });
  assert.equal(out.tier, "unknown");
  assert.equal(out.top, null);
  assert.match(out.childMessage, /다시|모르겠/);
});

test("프로바이더가 예외를 던져도 안전하게 unknown으로 마무리한다", async () => {
  const repo = new InMemoryTaxonRepo();
  const throwing = new MockProvider();
  throwing.identify = async () => {
    throw new Error("vendor down");
  };
  const gateway = new IdentificationGateway([throwing], repo);
  const out = await gateway.identify({ images: IMG, groupHint: "plant" });
  assert.equal(out.tier, "unknown");
  assert.equal(out.top, null);
});
