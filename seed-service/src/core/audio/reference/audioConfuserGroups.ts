/**
 * 오디오 혼동종 그룹 — doc03 11장 "혼동종 참조 포함" 요구를 만족시키기 위한 8단계 전용 목록.
 * 사진 파이프라인의 `core/identification/confusionPairs.ts`(BioCLIP 텍스트 임베딩 유사도
 * 기반, 82종 전수)를 재사용하지 않는다 — 그 목록엔 이 18개 조류 종 중 단 한 쌍
 * (청둥오리/흰뺨검둥오리)만 들어있어 커버리지가 턱없이 부족하고, 애초에 "시각적 유사도"
 * 프록시라 "소리가 헷갈리는지"와는 다른 축이다.
 *
 * 대신 `research/audio-reference-pool/README.md`의 "혼동종(confuser) — 잠정, 검증 필요"
 * 표를 그대로 코드로 옮겼다 — 그 문서 자체가 "1차 추정, 조류 음성학 전문 자료로 재검증
 * 필요"라고 명시하므로, 여기서도 같은 잠정성을 그대로 유지한다(임의로 확정하지 않음).
 */
import type { TaxonId } from "../../domain/types.js";

const GROUPS: readonly TaxonId[][] = [
  // 오리류
  ["taxon-anas-platyrhynchos", "taxon-anas-zonorhyncha"] as TaxonId[],
  // 백로류
  ["taxon-ardea-cinerea", "taxon-ardea-alba"] as TaxonId[],
  // 박새류
  ["taxon-parus-cinereus", "taxon-poecile-palustris"] as TaxonId[],
  // 까마귀류
  ["taxon-corvus-macrorhynchos", "taxon-pica-serica", "taxon-cyanopica-cyanus"] as TaxonId[],
];

const GROUP_BY_TAXON: ReadonlyMap<TaxonId, readonly TaxonId[]> = (() => {
  const m = new Map<TaxonId, TaxonId[]>();
  for (const group of GROUPS) {
    for (const taxonId of group) {
      const others = group.filter((t) => t !== taxonId);
      m.set(taxonId, others);
    }
  }
  return m;
})();

/** 이 종과 소리가 헷갈릴 수 있는 그룹 동료 종들(자기 자신 제외). 그룹에 없으면 빈 배열. */
export function getConfuserTaxonIds(taxonId: TaxonId): readonly TaxonId[] {
  return GROUP_BY_TAXON.get(taxonId) ?? [];
}
