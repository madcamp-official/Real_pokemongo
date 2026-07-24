/**
 * 종 카드 & 학습 콘텐츠 (명세서 F6).
 *
 * 연령별 2단 콘텐츠: toddler(음성+그림, 한 문장 재미사실) / child(읽기+관찰포인트+교과연계).
 * 안전 정보가 있으면 종 정보보다 먼저 노출(F4).
 *
 * 콘텐츠 원본 데이터는 CMS/데이터에서 온다. TODO(제공 필요): 콘텐츠 감수 프로세스(§14).
 */
import type { AgeBand, Taxon, TaxonId } from "../../core/domain/types.js";
import { SafetyFilter, type SafetyNotice } from "../../core/safety/SafetyFilter.js";

/** 종별 콘텐츠(연령 무관 원본). 표시 시 연령대에 맞게 렌더된다. */
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
  ageBand: AgeBand;
  safety: SafetyNotice | null; // showFirst=true 면 최상단
  body: {
    funFact: string;
    observePoints: string[];
    narrationRef?: string;
    showText: boolean; // toddler 면 false(음성 중심)
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

  /** 종 + 연령대 → 렌더된 카드. 안전 안내를 항상 먼저 계산해 붙인다. */
  render(taxon: Taxon, ageBand: AgeBand): RenderedCard {
    const content = this.get(taxon.id);
    const safety = this.safety.evaluate(taxon);
    const isToddler = ageBand === "toddler";
    return {
      displayName: taxon.korName || taxon.sciName,
      ageBand,
      safety,
      body: {
        funFact: content?.funFact ?? "",
        observePoints: content?.observePoints ?? [],
        narrationRef: content?.narrationRef,
        showText: !isToddler, // 글 못 읽는 연령은 음성 중심
      },
      // 퀴즈는 읽기 가능 연령에만 기본 노출(toddler 는 음성 O/X 로 확장 가능).
      quiz: isToddler ? undefined : content?.quiz,
    };
  }
}
