/**
 * 보호자 대시보드 (명세서 F11).
 *
 * 구매자(부모)를 위한 "안심·증거"의 공간. 아이별 주간 활동 요약, 교육과정 성취 리포트,
 * 프라이버시 통제 상태를 집계한다. (통제 조작 자체는 AccountService 소관.)
 */
import type { ChildId, GuardianId, Season } from "../../core/domain/types.js";
import type {
  ObservationRepository,
  CollectionRepository,
  TaxonRepository,
  ChildRepository,
  BadgeRepository,
  GuardianRepository,
} from "../../core/repositories/ports.js";
import type { AuthContext } from "../../core/auth/Authorization.js";

export interface WeeklyChildSummary {
  childId: ChildId;
  nickname: string;
  level: number;
  observationsThisWeek: number;
  distinctSpeciesThisWeek: number;
  groupBreakdown: Record<string, number>; // plant/insect/... 관찰 수
  activeDaysThisWeek: number;
  badgesTotal: number;
  /** 교육과정 연계 성취(§6): 이번 주 관찰이 건드린 커리큘럼 태그별 종 수. */
  curriculumProgress: Record<string, number>;
}

export interface DashboardView {
  guardianId: GuardianId;
  locationStorageEnabled: boolean; // 프라이버시 상태 노출
  children: WeeklyChildSummary[];
}

export class GuardianDashboard {
  constructor(
    private readonly guardians: GuardianRepository,
    private readonly children: ChildRepository,
    private readonly observations: ObservationRepository,
    private readonly collection: CollectionRepository,
    private readonly taxa: TaxonRepository,
    private readonly badges: BadgeRepository,
  ) {}

  /**
   * 대시보드는 **인증된 본인(ctx.guardianId)의 가족만** 집계한다.
   * guardianId 를 파라미터로 받지 않는 것이 의도 — 남의 가족 리포트 열람(IDOR)이
   * 시그니처 수준에서 불가능하다.
   */
  async build(ctx: AuthContext, now: Date = new Date()): Promise<DashboardView> {
    const guardianId = ctx.guardianId;
    const guardian = await this.guardians.get(guardianId);
    const kids = await this.children.listByGuardian(guardianId);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const summaries: WeeklyChildSummary[] = [];
    for (const kid of kids) {
      const recent = await this.observations.listByChildSince(kid.id, weekAgo);
      const distinct = new Set<string>();
      const groupBreakdown: Record<string, number> = {};
      const curriculumProgress: Record<string, number> = {};
      const days = new Set<string>();

      for (const o of recent) {
        days.add(o.timestamp.slice(0, 10));
        if (!o.taxonId) continue;
        distinct.add(o.taxonId as string);
        const t = await this.taxa.get(o.taxonId);
        if (t) {
          groupBreakdown[t.group] = (groupBreakdown[t.group] ?? 0) + 1;
          // 커리큘럼 태그 집계: 계절/서식지 기반의 간이 매핑(§6).
          for (const tag of this.curriculumTagsFor(t.seasonTags[0])) {
            curriculumProgress[tag] = (curriculumProgress[tag] ?? 0) + 1;
          }
        }
      }

      const badgeList = await this.badges.listByChild(kid.id);
      summaries.push({
        childId: kid.id,
        nickname: kid.nickname,
        level: kid.level,
        observationsThisWeek: recent.length,
        distinctSpeciesThisWeek: distinct.size,
        groupBreakdown,
        activeDaysThisWeek: days.size,
        badgesTotal: badgeList.length,
        curriculumProgress,
      });
    }

    return {
      guardianId,
      locationStorageEnabled: guardian?.locationStorageEnabled ?? false,
      children: summaries,
    };
  }

  /** 계절 → 교육과정 연계 태그(간이). 실제로는 Taxon 별 curriculumTags 로 정밀화. */
  private curriculumTagsFor(season?: Season): string[] {
    if (!season) return [];
    const map: Record<Season, string> = {
      spring: "통합교과-봄",
      summer: "통합교과-여름",
      autumn: "통합교과-가을",
      winter: "통합교과-겨울",
    };
    return [map[season]];
  }
}
