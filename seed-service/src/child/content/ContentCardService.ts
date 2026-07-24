/**
 * 종 카드 & 학습 콘텐츠 (명세서 F6).
 *
 * v1.2: 연령대(toddler/child) 2단 렌더링 분기 제거(`/species/{id}/card`의 age_group 파라미터
 * 자체가 신 스펙에서 삭제됨) — 항상 텍스트 중심으로 렌더한다.
 * 안전 정보가 있으면 종 정보보다 먼저 노출(F4)하는 원칙은 그대로 유지.
 *
 * 콘텐츠 원본 데이터는 CMS/데이터에서 온다. TODO(제공 필요): 콘텐츠 감수 프로세스(§14).
 */
import type { Taxon, TaxonId } from "../../core/domain/types.js";
import { SafetyFilter, type SafetyNotice } from "../../core/safety/SafetyFilter.js";

/** 종별 콘텐츠(원본). */
export interface SpeciesContent {
  taxonId: TaxonId;
  funFact: string; // "이건 몰랐지?" 한 문장
  observePoints: string[]; // 관찰 포인트
  similarSpecies?: string[]; // 혼동 종 구분
  narrationRef?: string; // 음성 나레이션 참조(TTS/성우). TODO(제공 필요)
  quiz?: { q: string; options: string[]; answerIndex: number }[];
  curriculumTags: string[]; // 교육과정 연계(§6)
}

/** 화면에 내보낼 렌더된 카드. */
export interface RenderedCard {
  displayName: string;
  safety: SafetyNotice | null; // showFirst=true 면 최상단
  body: {
    funFact: string;
    observePoints: string[];
    narrationRef?: string;
  };
  quiz?: SpeciesContent["quiz"];
}

export class ContentCardService {
  private safety = new SafetyFilter();
  private store = new Map<string, SpeciesContent>();

  upsert(content: SpeciesContent): void {
    this.store.set(content.taxonId as string, content);
  }

  get(taxonId: TaxonId): SpeciesContent | null {
    return this.store.get(taxonId as string) ?? null;
  }

  /** 종 → 렌더된 카드. 안전 안내를 항상 먼저 계산해 붙인다. */
  render(taxon: Taxon): RenderedCard {
    const content = this.get(taxon.id);
    const safety = this.safety.evaluate(taxon);
    return {
      displayName: taxon.korName || taxon.sciName,
      safety,
      body: {
        funFact: content?.funFact ?? "",
        observePoints: content?.observePoints ?? [],
        narrationRef: content?.narrationRef,
      },
      quiz: content?.quiz,
    };
  }
}
