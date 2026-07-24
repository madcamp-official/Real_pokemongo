/**
 * 퀘스트 엔진 (명세서 F7 + §5).
 *
 * 관찰이 확정될 때마다 활성 퀘스트들의 조건을 평가해 진행률을 갱신하고, 완료를 판정한다.
 * 핵심 규칙(§5): 진행은 오직 "실제 관찰"로만 이뤄진다. 화면 내 태스크로 완료되지 않는다.
 *
 * 완료 조건은 questCriteria 를 관찰 하나에 대한 술어로 평가하는 방식.
 */
import type { Observation, Taxon, UserId } from "../domain/types.js";
import type { Quest, QuestProgress, QuestCriteria } from "./questTypes.js";
import type { QuestRepository, TaxonRepository } from "../repositories/ports.js";

export interface QuestUpdate {
  quest: Quest;
  progress: QuestProgress;
  justCompleted: boolean;
}

export class QuestEngine {
  constructor(
    private readonly quests: QuestRepository,
    private readonly taxa: TaxonRepository,
  ) {}

  /**
   * 하나의 관찰을 활성 퀘스트 전체에 적용. 매칭·완료된 퀘스트 업데이트 목록 반환.
   */
  async applyObservation(
    obs: Observation,
    now: Date = new Date(),
  ): Promise<QuestUpdate[]> {
    if (!obs.taxonId) return []; // 미확정 관찰은 퀘스트 진행 없음
    const taxon = await this.taxa.get(obs.taxonId);
    if (!taxon) return [];

    const active = (await this.quests.listActive()).filter((q) =>
      this.isActiveAt(q, now),
    );
    const updates: QuestUpdate[] = [];

    for (const quest of active) {
      if (!this.matches(quest.criteria, taxon, obs)) continue;

      const progress = await this.getOrInitProgress(obs.userId, quest.id);
      if (progress.completed) continue;

      // 서로 다른 종만 카운트(중복 관찰 방지).
      if (progress.matchedTaxonIds.includes(obs.taxonId as string)) {
        continue;
      }
      progress.matchedTaxonIds.push(obs.taxonId as string);

      let justCompleted = false;
      if (progress.matchedTaxonIds.length >= quest.criteria.distinctTaxa) {
        progress.completed = true;
        progress.completedAt = now.toISOString();
        justCompleted = true;
      }
      await this.quests.saveProgress(progress);
      updates.push({ quest, progress, justCompleted });
    }
    return updates;
  }

  /** 관찰 하나가 퀘스트 조건절을 만족하는지(순수 술어). */
  private matches(
    criteria: QuestCriteria,
    taxon: Taxon,
    _obs: Observation,
  ): boolean {
    if (criteria.season && !taxon.seasonTags.includes(criteria.season)) {
      return false;
    }
    if (criteria.habitat && !taxon.habitatTags.includes(criteria.habitat)) {
      return false;
    }
    if (criteria.group && taxon.group !== criteria.group) return false;
    if (criteria.rarity && taxon.rarity !== criteria.rarity) return false;
    if (criteria.tagAny && criteria.tagAny.length > 0) {
      const taxonTags = new Set([
        ...(taxon.aliases ?? []),
        // 콘텐츠 태깅 확장 지점: 색/특징 태그를 Taxon 에 부여하면 여기서 매칭.
      ]);
      if (!criteria.tagAny.some((t) => taxonTags.has(t))) return false;
    }
    return true;
  }

  private isActiveAt(quest: Quest, now: Date): boolean {
    const t = now.toISOString();
    if (quest.activeFrom && t < quest.activeFrom) return false;
    if (quest.activeTo && t > quest.activeTo) return false;
    return true;
  }

  private async getOrInitProgress(
    userId: UserId,
    questId: string,
  ): Promise<QuestProgress> {
    const existing = await this.quests.getProgress(userId, questId);
    if (existing) return existing;
    return { userId, questId, matchedTaxonIds: [], completed: false };
  }

  /** 홈 화면에 노출할 진행 중 퀘스트(항상 최소 1개 보장은 시딩·로테이션 책임). */
  async activeForUser(userId: UserId, now: Date = new Date()) {
    const active = (await this.quests.listActive()).filter((q) =>
      this.isActiveAt(q, now),
    );
    return Promise.all(
      active.map(async (quest) => {
        const progress =
          (await this.quests.getProgress(userId, quest.id)) ??
          ({ userId, questId: quest.id, matchedTaxonIds: [], completed: false } as QuestProgress);
        return {
          quest,
          done: progress.matchedTaxonIds.length,
          goal: quest.criteria.distinctTaxa,
          completed: progress.completed,
        };
      }),
    );
  }
}
