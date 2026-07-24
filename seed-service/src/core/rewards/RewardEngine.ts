/**
 * 보상 엔진 (명세서 F8 + §5).
 *
 * 관찰/퀘스트 완료 이벤트를 받아 XP를 올리고, 결정론적 규칙으로 배지 획득을 판정한다.
 * 확률형 보상 없음. 모든 보상은 실제 활동에서 파생.
 */
import type { ChildId, ChildProfile, TaxonGroup } from "../domain/types.js";
import {
  levelForXp,
  type BadgeDefinition,
  type EarnedBadge,
  type LevelCurve,
  DEFAULT_LEVEL_CURVE,
} from "./rewardTypes.js";
import type {
  BadgeRepository,
  ChildRepository,
  CollectionRepository,
  ObservationRepository,
  QuestRepository,
  TaxonRepository,
} from "../repositories/ports.js";

export interface RewardOutcome {
  xpGained: number;
  newLevel: number | null; // 레벨업 했으면 새 레벨, 아니면 null
  newBadges: BadgeDefinition[];
}

export class RewardEngine {
  constructor(
    private readonly badgeDefs: BadgeDefinition[],
    private readonly badges: BadgeRepository,
    private readonly children: ChildRepository,
    private readonly collection: CollectionRepository,
    private readonly observations: ObservationRepository,
    private readonly quests: QuestRepository,
    private readonly taxa: TaxonRepository,
    private readonly curve: LevelCurve = DEFAULT_LEVEL_CURVE,
  ) {}

  /**
   * 관찰(및 연관된 도감 해금) 이후 보상 평가.
   * @param baseXp 이 활동 자체의 기본 XP(예: 신규 종 해금 10, 재관찰 2)
   */
  async onObservation(
    child: ChildProfile,
    opts: { newlyUnlocked: boolean; now?: Date },
  ): Promise<RewardOutcome> {
    const baseXp = opts.newlyUnlocked ? 10 : 2;
    return this.grant(child, baseXp, opts.now);
  }

  /** 퀘스트 완료 보상. */
  async onQuestComplete(
    child: ChildProfile,
    questXp: number,
    questBadgeId: string | undefined,
    now: Date = new Date(),
  ): Promise<RewardOutcome> {
    const outcome = await this.grant(child, questXp, now);
    if (questBadgeId && !(await this.badges.has(child.id, questBadgeId))) {
      const def = this.badgeDefs.find((b) => b.id === questBadgeId);
      if (def) {
        await this.awardBadge(child.id, def, now);
        outcome.newBadges.push(def);
      }
    }
    return outcome;
  }

  /** XP 지급 + 레벨 재계산 + 규칙 기반 배지 평가를 한번에. */
  private async grant(
    child: ChildProfile,
    xp: number,
    now: Date = new Date(),
  ): Promise<RewardOutcome> {
    const prevLevel = levelForXp(child.xp, this.curve);
    const updated: ChildProfile = { ...child, xp: child.xp + xp };
    const newLevel = levelForXp(updated.xp, this.curve);
    updated.level = newLevel;
    await this.children.save(updated);

    const newBadges = await this.evaluateBadges(updated, now);

    return {
      xpGained: xp,
      newLevel: newLevel > prevLevel ? newLevel : null,
      newBadges,
    };
  }

  /** 모든 배지 규칙을 현재 상태에 대해 평가하고, 새로 충족된 것을 지급. */
  private async evaluateBadges(
    child: ChildProfile,
    now: Date,
  ): Promise<BadgeDefinition[]> {
    const earned: BadgeDefinition[] = [];
    for (const def of this.badgeDefs) {
      if (await this.badges.has(child.id, def.id)) continue;
      if (await this.satisfies(child.id, def)) {
        await this.awardBadge(child.id, def, now);
        earned.push(def);
      }
    }
    return earned;
  }

  private async satisfies(
    childId: ChildId,
    def: BadgeDefinition,
  ): Promise<boolean> {
    const rule = def.rule;
    switch (rule.kind) {
      case "firstObservation": {
        const obs = await this.observations.listByChild(childId);
        return obs.length >= 1;
      }
      case "totalObservations": {
        const obs = await this.observations.listByChild(childId);
        return obs.length >= rule.count;
      }
      case "distinctTaxaInGroup": {
        const count = await this.distinctTaxaInGroup(childId, rule.group);
        return count >= rule.count;
      }
      case "seasonComplete": {
        const inSeason = await this.taxa.list({ season: rule.season });
        if (inSeason.length === 0) return false;
        const entries = await this.collection.listByChild(childId);
        const unlocked = new Set(
          entries.filter((e) => e.unlocked).map((e) => e.taxonId as string),
        );
        return inSeason.every((t) => unlocked.has(t.id as string));
      }
      case "questCount": {
        const progress = await this.quests.listProgressByChild(childId);
        return progress.filter((p) => p.completed).length >= rule.count;
      }
    }
  }

  private async distinctTaxaInGroup(
    childId: ChildId,
    group: TaxonGroup,
  ): Promise<number> {
    const entries = await this.collection.listByChild(childId);
    const unlocked = entries.filter((e) => e.unlocked);
    let count = 0;
    for (const e of unlocked) {
      const t = await this.taxa.get(e.taxonId);
      if (t && t.group === group) count++;
    }
    return count;
  }

  private async awardBadge(
    childId: ChildId,
    def: BadgeDefinition,
    now: Date,
  ): Promise<void> {
    const badge: EarnedBadge = {
      childId,
      badgeId: def.id,
      earnedAt: now.toISOString(),
    };
    await this.badges.award(badge);
    // 배지 자체의 XP 는 레벨 재계산 루프를 피하려 여기서 직접 반영하지 않는다.
    // (배지 XP 를 원하면 grant 경로로 별도 호출.)
  }
}
