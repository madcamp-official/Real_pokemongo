/**
 * 동정 게이트웨이 (명세서 F3 + §7).
 *
 * 역할:
 *   1) 대상군에 맞는 프로바이더로 라우팅 (설정된 것만).
 *   2) 벤더 결과를 표준화하고 학명→국명(Taxon) 매핑.
 *   3) 확신도 정책으로 tier 분기 (high/medium/low/unknown).
 *   4) 안전 필터를 태워 위험 안내를 (있으면) 앞세운다.
 *
 * 이 클래스는 "무엇을 아이에게 보여줄지"의 결정(IdentificationOutcome)까지만 만든다.
 * 관찰 저장/도감/퀘스트 반영은 상위 오케스트레이터(ObservationFlow)의 몫.
 */
import type {
  IdentificationProvider,
  IdentifyInput,
  IdentificationCandidate,
} from "./IdentificationProvider.js";
import {
  classifyConfidence,
  MAX_CANDIDATES_TO_SHOW,
  DEFAULT_THRESHOLDS,
  type ConfidenceThresholds,
  type ConfidenceTier,
} from "./confidencePolicy.js";
import type { Taxon, TaxonRank } from "../domain/types.js";
import type { TaxonRepository } from "../repositories/ports.js";
import { NameMapper } from "../taxonomy/nameMapping.js";
import { SafetyFilter, type SafetyNotice } from "../safety/SafetyFilter.js";
import { isConfusablePair } from "./confusionPairs.js";

/**
 * "high"인데도 top1/top2 확신도 차이가 이 값 미만이면 medium으로 강등한다(단, top1/top2가
 * confusionPairs.ts의 알려진 혼동 쌍일 때만 -- 무관한 두 종이 우연히 둘 다 확신도가 높은
 * 것까지 강등하면 오히려 UX만 나빠짐). 실측 데이터 없는 최초값 -- confidencePolicy.ts의
 * DEFAULT_THRESHOLDS와 같은 성격의 TODO(튜닝) 대상.
 */
const CONFUSION_MARGIN_THRESHOLD = 0.05;

/** 아이에게 보여줄, 국명이 붙은 후보. */
export interface ResolvedCandidate {
  taxon: Taxon | null; // 마스터 DB 매칭 실패 시 null
  displayName: string; // 국명 우선
  scientificName: string;
  rank: TaxonRank;
  confidence: number;
}

/**
 * 게이트웨이의 최종 산출물. UI 는 tier 에 따라 다른 화면을 그린다(§7 표).
 *  - high    : 단정 카드 해금 (top 1)
 *  - medium  : "이 중 하나예요" 후보 고르기
 *  - fallback: 종은 못 맞혔지만 상위 분류(과/목)까지 알려줌
 *  - unknown : "아직 모르겠어요, 다시 찍어볼까요"
 */
export interface IdentificationOutcome {
  tier: ConfidenceTier | "fallback";
  top: ResolvedCandidate | null;
  candidates: ResolvedCandidate[]; // medium 일 때 표시할 후보들
  /** 안전 안내. showFirst=true 면 종 정보보다 먼저 노출해야 함(§F4/§7). */
  safety: SafetyNotice | null;
  source: string; // 어떤 프로바이더가 냈는지 (Observation.source)
  /** 아이용 한 줄 메시지(연출 문구). */
  childMessage: string;
  /** unknown일 때 재촬영 문제인지 서버 문제인지 UI가 구분할 수 있게 한다. */
  unknownReason?: "NO_PROVIDER" | "PROVIDER_UNAVAILABLE" | "LOW_CONFIDENCE";
}

export class IdentificationGateway {
  private readonly nameMapper: NameMapper;
  private readonly safety = new SafetyFilter();

  constructor(
    private readonly providers: IdentificationProvider[],
    private readonly taxa: TaxonRepository,
    private readonly thresholds: ConfidenceThresholds = DEFAULT_THRESHOLDS,
  ) {
    this.nameMapper = new NameMapper(taxa);
  }

  async identify(input: IdentifyInput): Promise<IdentificationOutcome> {
    const providers = this.selectProviders(input);
    if (providers.length === 0) {
      return this.unknownOutcome(
        "no-provider",
        "지금은 동정할 수 없어요. 잠시 뒤 다시 시도해요.",
        "NO_PROVIDER",
      );
    }

    // 설정된 첫 프로바이더가 일시 장애여도 다음 프로바이더를 시도한다. 예를 들어
    // BioCLIP SSH 터널이 끊겼을 때 여기서 즉시 unknown을 반환하면, 같은 게이트웨이를
    // 공유하는 터치 스캔과 촬영 동정이 동시에 전부 죽는다.
    let raw = null;
    let lastProviderName = providers[0]!.name;
    for (const provider of providers) {
      lastProviderName = provider.name;
      try {
        raw = await provider.identify(input);
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `[identification] ${provider.name} 실패 — 다음 프로바이더를 시도합니다: ${reason}`,
        );
      }
    }
    if (!raw) {
      // 모든 프로바이더 실패/타임아웃 → 좌절 없는 마무리(§7 마지막 행)
      return this.unknownOutcome(
        lastProviderName,
        "인식 서버에 잠시 연결하지 못했어요.",
        "PROVIDER_UNAVAILABLE",
      );
    }

    const resolved = await this.resolveCandidates(raw.candidates);
    resolved.sort((a, b) => b.confidence - a.confidence);
    const top = resolved[0] ?? null;
    const topConfidence = top?.confidence ?? 0;
    let tier = classifyConfidence(topConfidence, this.thresholds);

    // 조건 2(혼동 종): top1이 확신도는 높아도, 알려진 혼동 쌍인 top2와 차이가 근소하면
    // 단정하지 않고 medium으로 물러나 아이가 직접 고르게 한다(§7 "틀릴 땐 안전하게").
    // resolveCandidates가 이미 raw.candidates 순서를 taxon으로 매핑했을 뿐 정렬은 안 해서,
    // 여기서 sort 이후의 resolved[1]을 봐야 진짜 2위 후보다.
    const second = resolved[1];
    if (
      tier === "high" &&
      top &&
      second &&
      isConfusablePair(top.scientificName, second.scientificName) &&
      top.confidence - second.confidence < CONFUSION_MARGIN_THRESHOLD
    ) {
      tier = "medium";
    }

    if (tier === "high" && top) {
      const safety = top.taxon ? this.safety.evaluate(top.taxon) : null;
      return {
        tier: "high",
        top,
        candidates: [top],
        safety,
        source: raw.source,
        childMessage: this.highMessage(top, safety),
      };
    }

    if (tier === "medium") {
      const shortlist = resolved.slice(0, MAX_CANDIDATES_TO_SHOW);
      const taxaOfShortlist = shortlist
        .map((c) => c.taxon)
        .filter((t): t is Taxon => t !== null);
      const safety = this.safety.evaluateCandidates(taxaOfShortlist);
      return {
        tier: "medium",
        top,
        candidates: shortlist,
        safety,
        source: raw.source,
        childMessage: "이 중에 누구일까요? 골라볼까요? 🤔",
      };
    }

    // low(=어느 정도 신호는 있으나 종을 특정하기엔 부족) → 상위 분류 폴백(§7).
    // 그 종의 상위 분류군(Taxon.parentId)으로 물러나 "○○ 종류예요"로만 안내한다.
    // unknown(<low) 이거나 상위 분류를 알 수 없으면 좌절 없는 재촬영 안내.
    if (tier === "low" && top?.taxon?.parentId) {
      const parent = await this.taxa.get(top.taxon.parentId);
      if (parent) {
        const resolvedParent: ResolvedCandidate = {
          taxon: parent,
          displayName: this.nameMapper.displayName(parent),
          scientificName: parent.sciName,
          rank: parent.rank,
          confidence: top.confidence,
        };
        const safety = this.safety.evaluate(parent);
        return {
          tier: "fallback",
          top: resolvedParent,
          candidates: [resolvedParent],
          safety,
          source: raw.source,
          childMessage: safety?.showFirst
            ? safety.message
            : `정확한 이름은 모르겠지만, ${resolvedParent.displayName} 종류예요!`,
        };
      }
    }

    return this.unknownOutcome(
      raw.source,
      "음~ 아직 잘 모르겠어요. 다른 각도로 한 번 더 찍어볼까요? 📸",
      "LOW_CONFIDENCE",
    );
  }

  // --- 내부 --------------------------------------------------------------

  /** 대상군을 지원하고 설정된(키가 있는) 프로바이더를 우선순위대로 선택. */
  private selectProviders(input: IdentifyInput): IdentificationProvider[] {
    const hint = input.groupHint;
    const usable = this.providers.filter((p) => p.isConfigured());
    if (hint) {
      return usable.filter((p) => p.supports.includes(hint));
    }
    return usable;
  }

  private async resolveCandidates(
    candidates: IdentificationCandidate[],
  ): Promise<ResolvedCandidate[]> {
    return Promise.all(candidates.map((c) => this.resolveOne(c)));
  }

  private async resolveOne(
    c: IdentificationCandidate,
  ): Promise<ResolvedCandidate> {
    const taxon = await this.nameMapper.resolveBySciName(c.scientificName);
    const displayName =
      taxon?.korName || c.vernacularName || c.scientificName;
    return {
      taxon,
      displayName,
      scientificName: c.scientificName,
      rank: c.rank,
      confidence: c.confidence,
    };
  }

  private highMessage(top: ResolvedCandidate, safety: SafetyNotice | null): string {
    if (safety?.showFirst) return safety.message; // 안전을 앞세운다
    const pct = Math.round(top.confidence * 100);
    return `${top.displayName}예요! ${pct}% 확신해요 ✨`;
  }

  private unknownOutcome(
    source: string,
    message: string,
    reason: NonNullable<IdentificationOutcome["unknownReason"]>,
  ): IdentificationOutcome {
    return {
      tier: "unknown",
      top: null,
      candidates: [],
      safety: null,
      source,
      childMessage: message,
      unknownReason: reason,
    };
  }
}
