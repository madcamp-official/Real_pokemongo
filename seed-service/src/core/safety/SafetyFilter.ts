/**
 * 안전 필터 (명세서 F4: 위험·독성 생물 경고).
 *
 * 원칙(§0-2): "틀릴 때 안전하게 틀린다." 위험 후보를 배제할 수 없으면 종 정보보다
 * 안전 안내를 먼저 노출한다. 버섯류는 식용 가부를 절대 판정하지 않는다.
 *
 * 순수 로직 — Taxon.riskTags 만 보고 판단. 부수효과 없음.
 */
import type { Taxon, RiskTag, TaxonGroup } from "../domain/types.js";

export interface SafetyNotice {
  /** true면 종 상세보다 이 안내를 상단에 우선 노출해야 함. */
  showFirst: boolean;
  level: "info" | "warning" | "danger";
  /** 아이에게 보여줄 안내 문구. */
  message: string;
  riskTags: RiskTag[];
}

/** 위험 태그별 아동용 안내 문구. */
const RISK_MESSAGES: Record<RiskTag, string> = {
  toxic_if_eaten: "입에 넣으면 안 돼요. 눈으로만 관찰해요 👀",
  sting_or_bite: "쏘이거나 물릴 수 있어요. 가까이 가지 말고 멀리서 봐요",
  contact_dermatitis: "만지면 피부가 가려울 수 있어요. 손대지 말고 관찰만 해요",
  allergen: "알레르기가 있을 수 있어요. 만지지 않는 게 좋아요",
  protected_species: "소중한 친구예요. 만지지 말고 지켜만 봐요 💚",
};

const LEVEL_BY_TAG: Record<RiskTag, SafetyNotice["level"]> = {
  toxic_if_eaten: "danger",
  sting_or_bite: "danger",
  contact_dermatitis: "warning",
  allergen: "warning",
  protected_species: "info",
};

export class SafetyFilter {
  /**
   * 확정된(또는 후보) Taxon 하나에 대한 안전 안내를 만든다.
   * riskTags 가 비어 있으면 안내 없음(null).
   */
  evaluate(taxon: Taxon): SafetyNotice | null {
    // 버섯류 특례: 식용 판정을 하지 않는다는 사실 자체를 안전 안내로 통일.
    if (taxon.group === "fungus") {
      const tags = taxon.riskTags.length ? taxon.riskTags : [];
      return {
        showFirst: true,
        level: "warning",
        message: "버섯은 눈으로만 관찰해요. 만지거나 먹으면 안 돼요 🍄",
        riskTags: tags,
      };
    }

    if (taxon.riskTags.length === 0) return null;

    const level = this.highestLevel(taxon.riskTags);
    const messages = taxon.riskTags.map((t) => RISK_MESSAGES[t]);
    return {
      showFirst: true,
      level,
      message: messages.join(" ").trim(),
      riskTags: [...taxon.riskTags],
    };
  }

  /**
   * 여러 후보(중확신 상태)에 대해: 위험 후보가 하나라도 섞여 있으면
   * "배제 불가"로 보고 보수적으로 안전 안내를 낸다(§7의 '위험 후보 포함' 행).
   */
  evaluateCandidates(taxa: Taxon[]): SafetyNotice | null {
    const risky = taxa.filter(
      (t) => t.riskTags.length > 0 || t.group === "fungus",
    );
    if (risky.length === 0) return null;
    const allTags = [...new Set(risky.flatMap((t) => t.riskTags))];
    // 버섯이 섞였으면 버섯 특례 문구 우선.
    if (risky.some((t) => t.group === "fungus")) {
      return {
        showFirst: true,
        level: "warning",
        message:
          "이 중에 조심해야 하는 친구가 있을 수 있어요. 만지지 말고 눈으로만 관찰해요",
        riskTags: allTags,
      };
    }
    return {
      showFirst: true,
      level: this.highestLevel(allTags),
      message:
        "이 중에 조심해야 하는 친구가 있을 수 있어요. 손대지 말고 멀리서 관찰해요",
      riskTags: allTags,
    };
  }

  private highestLevel(tags: RiskTag[]): SafetyNotice["level"] {
    const order: SafetyNotice["level"][] = ["info", "warning", "danger"];
    return tags
      .map((t) => LEVEL_BY_TAG[t])
      .reduce(
        (acc, lvl) => (order.indexOf(lvl) > order.indexOf(acc) ? lvl : acc),
        "info" as SafetyNotice["level"],
      );
  }
}

/** 이 서비스는 식용 가부를 판정하지 않는다는 것을 타입으로도 문서화. */
export const EDIBILITY_JUDGEMENT_SUPPORTED = false as const;

/** 특정 군이 MVP 동정 파이프라인 대상인지(명세서 §12: 새/양서류 제외). */
export function isMvpIdentifiable(group: TaxonGroup): boolean {
  return group === "plant" || group === "insect" || group === "fungus";
}
