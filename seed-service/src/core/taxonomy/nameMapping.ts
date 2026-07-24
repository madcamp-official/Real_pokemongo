/**
 * 학명 → 국명 매핑 (명세서 F3, §8).
 *
 * 프로바이더는 보통 학명(또는 영어명)을 준다. 아이에게는 국명으로 보여줘야 한다.
 * 원천은 종 마스터 DB(Taxon). 여기서는 매핑 로직만 담고, 데이터 소스 연동은
 * TODO(제공 필요): 국가생물종지식정보시스템 등 공공 API(SPECIES_MASTER_ENDPOINT).
 */
import type { Taxon } from "../domain/types.js";
import type { TaxonRepository } from "../repositories/ports.js";

export class NameMapper {
  constructor(private readonly taxa: TaxonRepository) {}

  /** 학명으로 Taxon 을 찾아 국명 등 로컬 정보를 붙인다. 없으면 null. */
  async resolveBySciName(sciName: string): Promise<Taxon | null> {
    // 정규화: 대소문자/공백. (아종 표기 제거 등은 확장 지점)
    const normalized = sciName.trim().replace(/\s+/g, " ");
    const exact = await this.taxa.findBySciName(normalized);
    if (exact) return exact;
    // 종 매칭 실패 시 속(genus)까지라도 매칭 시도(상위분류 폴백 지원).
    const genus = normalized.split(" ")[0];
    if (genus && genus !== normalized) {
      return this.taxa.findBySciName(genus);
    }
    return null;
  }

  /** 표시용 이름. 국명 우선, 없으면 학명. */
  displayName(taxon: Taxon): string {
    return taxon.korName || taxon.sciName;
  }
}
