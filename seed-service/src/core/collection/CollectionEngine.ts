/**
 * 도감 진행률 엔진 (명세서 F5).
 *
 * 관찰이 확정되면 해당 종 카드를 해금하고, 첫 발견 정보를 기록한다.
 * 진행률은 "전체 종 집합 대비 수집 현황"으로 계산(계절/서식지 축 필터 지원).
 *
 * 이 엔진은 범용 코어 후보다(도감 = 관찰 플랫폼 공통 기능).
 */
import type {
  UserId,
  TaxonId,
  Observation,
  CollectionEntry,
  Season,
  Habitat,
} from "../domain/types.js";
import type {
  CollectionRepository,
  ObservationRepository,
  TaxonRepository,
} from "../repositories/ports.js";

export interface UnlockResult {
  entry: CollectionEntry;
  newlyUnlocked: boolean; // 이번에 처음 해금됐는지(연출 트리거)
}

export interface CollectionProgress {
  unlockedCount: number;
  totalCount: number;
  ratio: number; // 0..1
}

export class CollectionEngine {
  constructor(
    private readonly collection: CollectionRepository,
    private readonly taxa: TaxonRepository,
    private readonly observations: ObservationRepository,
  ) {}

  /**
   * 확정된 관찰을 도감에 반영. taxonId 가 null(동정 실패)이면 아무것도 하지 않는다.
   */
  async applyObservation(obs: Observation): Promise<UnlockResult | null> {
    if (!obs.taxonId) return null;
    const existing = await this.collection.get(obs.userId, obs.taxonId);

    if (existing && existing.unlocked) {
      // firstObservationId는 "최초 발견 시각"(firstObservedAt)과 별개로 지도 핀
      // 좌표의 출처로도 쓰인다(map.routes.ts GET /map/pins). 최초 발견 당시 위치 수집이
      // 꺼져 있어 좌표가 없었다면, 그 상태로 영구히 고정돼 핀이 절대 못 떴다
      // (2026-07-30 버그 리포트). 대표 관찰에 좌표가 없고 이번 재관찰엔 좌표가 있으면
      // 대표 관찰을 이번 것으로 옮겨 핀이 뜨게 한다 — 이미 좌표가 있으면 덮어쓰지 않는다.
      const shouldAdoptAsMapPinSource = await this.shouldAdoptAsMapPinSource(existing, obs);
      const updated: CollectionEntry = {
        ...existing,
        timesObserved: existing.timesObserved + 1,
        ...(shouldAdoptAsMapPinSource ? { firstObservationId: obs.id } : {}),
      };
      await this.collection.save(updated);
      return { entry: updated, newlyUnlocked: false };
    }

    const entry: CollectionEntry = {
      userId: obs.userId,
      taxonId: obs.taxonId,
      unlocked: true,
      firstObservedAt: obs.timestamp,
      firstObservationId: obs.id,
      timesObserved: (existing?.timesObserved ?? 0) + 1,
    };
    await this.collection.save(entry);
    return { entry, newlyUnlocked: true };
  }

  private async shouldAdoptAsMapPinSource(
    existing: CollectionEntry,
    obs: Observation,
  ): Promise<boolean> {
    if (!obs.preciseCoord) return false;
    if (!existing.firstObservationId) return true;
    const current = await this.observations.get(existing.firstObservationId);
    return !current?.preciseCoord;
  }

  /** 전체(또는 계절/서식지 축) 진행률. */
  async progress(
    userId: UserId,
    filter?: { season?: Season; habitat?: Habitat },
  ): Promise<CollectionProgress> {
    const total = await this.taxa.count(filter);
    const entries = await this.collection.listByUser(userId);

    let unlockedCount = entries.filter((e) => e.unlocked).length;
    if (filter) {
      // 축 필터가 있으면 해당 축에 속한 종만 카운트.
      const inScope = new Set(
        (await this.taxa.list(filter)).map((t) => t.id as string),
      );
      unlockedCount = entries.filter(
        (e) => e.unlocked && inScope.has(e.taxonId as string),
      ).length;
    }

    return {
      unlockedCount,
      totalCount: total,
      ratio: total === 0 ? 0 : unlockedCount / total,
    };
  }

  /**
   * 미해금 종의 실루엣 힌트(명세서 F5). 정밀 위치 없이 계절/서식지 기반으로만 노출.
   * "이 근처에 있대!"의 근거는 좌표가 아니라 seasonTags/habitatTags 다.
   */
  async silhouetteHints(
    userId: UserId,
    ctx: { season?: Season; habitat?: Habitat },
    max = 5,
  ): Promise<TaxonId[]> {
    const candidates = await this.taxa.list(ctx);
    const entries = await this.collection.listByUser(userId);
    const unlocked = new Set(
      entries.filter((e) => e.unlocked).map((e) => e.taxonId as string),
    );
    return candidates
      .filter((t) => !unlocked.has(t.id as string))
      .slice(0, max)
      .map((t) => t.id);
  }
}
