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
import { generateDailyQuest } from "./dailyQuestGenerator.js";
import { seasonForDate, seoulDateKey } from "./season.js";

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

    // 계절 노출 필터(isSeasonallyVisible)는 일부러 안 건다 — "지금 화면에 안 보이는
    // 계절 퀘스트"라도 실제로 조건을 만족하는 관찰이면 진행은 조용히 쌓인다(예: 여름에
    // 민들레를 관찰해도 "봄의 노란 꽃" 퀘스트 진행은 그대로 오름). 화면 노출 여부와 진행
    // 여부를 분리해야, 봄이 왔을 때 "어? 이미 2/3 진행돼 있네" 같은 자연스러운 경험이
    // 되고, 계절이 바뀌는 순간 진행률이 리셋되는 혼란도 없다.
    const active = await this.matchableQuests(now);
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

  /**
   * "봄 퀘스트인데 지금은 겨울" 같은 상황을 막는 필터. seasonal 타입이 아니거나
   * criteria.season이 없는 퀘스트(테마/데일리 등)는 계절과 무관하게 항상 통과시킨다.
   * criteria.season은 완료 판정(matches)에도 쓰이는 그 필드를 그대로 재사용한다 —
   * "이 퀘스트는 봄 종을 요구한다"와 "이 퀘스트는 봄에만 노출된다"를 같은 값으로 본다.
   */
  private isSeasonallyVisible(quest: Quest, now: Date): boolean {
    if (quest.type !== "seasonal" || !quest.criteria.season) return true;
    return quest.criteria.season === seasonForDate(now);
  }

  /**
   * 오늘(Asia/Seoul)의 데일리 퀘스트가 저장소에 없으면 생성해 박아둔다(멱등 — 이미 있으면
   * 그대로 재사용). claim(QuestRepository.get)이 정상 동작하려면 실제로 저장돼 있어야 한다.
   */
  private async ensureDailyQuest(now: Date): Promise<Quest> {
    const id = `quest-daily-${seoulDateKey(now)}`;
    const existing = await this.quests.get(id);
    if (existing) return existing;
    const taxa = await this.taxa.list();
    const quest = generateDailyQuest(taxa, now);
    await this.quests.upsertMany([quest]);
    return quest;
  }

  /** 완료 판정 대상(활성 기간 내 전부 — 계절 노출 필터는 적용하지 않음). */
  private async matchableQuests(now: Date): Promise<Quest[]> {
    await this.ensureDailyQuest(now);
    const all = await this.quests.listActive();
    return all.filter((q) => this.isActiveAt(q, now));
  }

  /**
   * 지금 이 순간 화면에 노출돼야 하는 퀘스트(활성 기간 + 실제 오늘 날짜 기준 계절 매칭).
   * /quests 라우트와 activeForUser가 이 메서드를 쓴다 — "노출"의 단일 진실 원천.
   */
  async listVisibleQuests(now: Date = new Date()): Promise<Quest[]> {
    const matchable = await this.matchableQuests(now);
    return matchable.filter((q) => this.isSeasonallyVisible(q, now));
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
    const active = await this.listVisibleQuests(now);
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
