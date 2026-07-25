/**
 * 보상 엔진 (명세서 F8 + §5).
 *
 * 관찰/퀘스트 완료 이벤트를 받아 XP를 올리고, 결정론적 규칙으로 배지 획득을 판정한다.
 * 확률형 보상 없음. 모든 보상은 실제 활동에서 파생.
 */
import type { UserId, User, TaxonGroup } from "../domain/types.js";
import {
  levelForXp,
  type BadgeDefinition,
  type EarnedBadge,
  type LevelCurve,
  DEFAULT_LEVEL_CURVE,
} from "./rewardTypes.js";
import type {
  BadgeRepository,
  UserRepository,
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

/**
 * D단계: claim(수령) 요청이 유효하지 않을 때. `reason`으로 HTTP 계층이 상태 코드를 매핑한다
 * (server.ts 전역 에러 핸들러 참고) — 존재하지 않음/아직 조건 미충족/이미 수령함을 구분한다.
 */
export class ClaimError extends Error {
  constructor(public readonly reason: "not_found" | "not_completed" | "already_claimed") {
    super(`claim 불가: ${reason}`);
  }
}

export class RewardEngine {
  constructor(
    private readonly badgeDefs: BadgeDefinition[],
    private readonly badges: BadgeRepository,
    private readonly users: UserRepository,
    private readonly collection: CollectionRepository,
    private readonly observations: ObservationRepository,
    private readonly quests: QuestRepository,
    private readonly taxa: TaxonRepository,
    private readonly curve: LevelCurve = DEFAULT_LEVEL_CURVE,
  ) {}

  /** HTTP 라우트(GET /badges)가 "아직 해금 안 된 배지"까지 포함해 전체 목록을 보여줄 때 씀. */
  listBadgeDefinitions(): BadgeDefinition[] {
    return this.badgeDefs;
  }

  /** HTTP 라우트(GET /profile/xp 등)가 xp_to_next를 계산할 때 씀. */
  getLevelCurve(): LevelCurve {
    return this.curve;
  }

  /**
   * 관찰(및 연관된 도감 해금) 이후 보상 평가.
   * @param baseXp 이 활동 자체의 기본 XP(예: 신규 종 해금 10, 재관찰 2)
   */
  async onObservation(
    user: User,
    opts: { newlyUnlocked: boolean; now?: Date },
  ): Promise<RewardOutcome> {
    const baseXp = opts.newlyUnlocked ? 10 : 2;
    return this.grant(user, baseXp, opts.now);
  }

  /**
   * D단계: 퀘스트 보상 수령(claim). `POST /quests/:id/claim`이 호출한다.
   * `progress.completed`가 true여야 하고, 이미 claim했으면 다시 못 한다(멱등 아님 —
   * 중복 지급 방지가 목적이라 의도적으로 에러).
   *
   * 프론트 mock(`claimMockQuest`)과 동일한 동작: 퀘스트 자체의 XP는 지급하고,
   * `reward.badgeId`가 있으면 그 배지를 "해금"만 한다(claim은 별도 — claimBadge에서).
   */
  async claimQuest(
    userId: UserId,
    questId: string,
    now: Date = new Date(),
  ): Promise<RewardOutcome> {
    const quest = await this.quests.get(questId);
    if (!quest) throw new ClaimError("not_found");
    const progress = await this.quests.getProgress(userId, questId);
    if (!progress || !progress.completed) throw new ClaimError("not_completed");
    if (progress.claimedAt) throw new ClaimError("already_claimed");

    const user = await this.users.get(userId);
    if (!user) throw new ClaimError("not_found");

    const outcome = await this.grant(user, quest.reward.xp, now);
    if (quest.reward.badgeId && !(await this.badges.has(userId, quest.reward.badgeId))) {
      const def = this.badgeDefs.find((b) => b.id === quest.reward.badgeId);
      if (def) {
        await this.awardBadge(userId, def, now); // 해금만(claimedAt 없음) — XP는 별도 claim.
        outcome.newBadges.push(def);
      }
    }

    await this.quests.saveProgress({ ...progress, claimedAt: now.toISOString() });
    return outcome;
  }

  /**
   * D단계: 배지 보상 수령(claim). `POST /badges/claim`이 호출한다. 배지가 해금(존재)돼
   * 있고 아직 claim 전이어야 한다.
   */
  async claimBadge(
    userId: UserId,
    badgeId: string,
    now: Date = new Date(),
  ): Promise<RewardOutcome> {
    const earned = await this.badges.get(userId, badgeId);
    if (!earned) throw new ClaimError("not_found");
    if (earned.claimedAt) throw new ClaimError("already_claimed");

    const def = this.badgeDefs.find((b) => b.id === badgeId);
    if (!def) throw new ClaimError("not_found");
    const user = await this.users.get(userId);
    if (!user) throw new ClaimError("not_found");

    const outcome = await this.grant(user, def.xp, now);
    await this.badges.markClaimed(userId, badgeId, now.toISOString());
    return outcome;
  }

  /** XP 지급 + 레벨 재계산 + 규칙 기반 배지 평가를 한번에. */
  private async grant(
    user: User,
    xp: number,
    now: Date = new Date(),
  ): Promise<RewardOutcome> {
    const prevLevel = levelForXp(user.xp, this.curve);
    const updated: User = { ...user, xp: user.xp + xp };
    const newLevel = levelForXp(updated.xp, this.curve);
    updated.level = newLevel;
    await this.users.save(updated);

    const newBadges = await this.evaluateBadges(updated, now);

    return {
      xpGained: xp,
      newLevel: newLevel > prevLevel ? newLevel : null,
      newBadges,
    };
  }

  /** 모든 배지 규칙을 현재 상태에 대해 평가하고, 새로 충족된 것을 지급. */
  private async evaluateBadges(
    user: User,
    now: Date,
  ): Promise<BadgeDefinition[]> {
    const earned: BadgeDefinition[] = [];
    for (const def of this.badgeDefs) {
      if (await this.badges.has(user.id, def.id)) continue;
      if (await this.satisfies(user.id, def)) {
        await this.awardBadge(user.id, def, now);
        earned.push(def);
      }
    }
    return earned;
  }

  private async satisfies(
    userId: UserId,
    def: BadgeDefinition,
  ): Promise<boolean> {
    const rule = def.rule;
    switch (rule.kind) {
      case "firstObservation": {
        const obs = await this.observations.listByUser(userId);
        return obs.length >= 1;
      }
      case "totalObservations": {
        const obs = await this.observations.listByUser(userId);
        return obs.length >= rule.count;
      }
      case "distinctTaxaInGroup": {
        const count = await this.distinctTaxaInGroup(userId, rule.group);
        return count >= rule.count;
      }
      case "seasonComplete": {
        const inSeason = await this.taxa.list({ season: rule.season });
        if (inSeason.length === 0) return false;
        const entries = await this.collection.listByUser(userId);
        const unlocked = new Set(
          entries.filter((e) => e.unlocked).map((e) => e.taxonId as string),
        );
        return inSeason.every((t) => unlocked.has(t.id as string));
      }
      case "questCount": {
        const progress = await this.quests.listProgressByUser(userId);
        return progress.filter((p) => p.completed).length >= rule.count;
      }
    }
  }

  private async distinctTaxaInGroup(
    userId: UserId,
    group: TaxonGroup,
  ): Promise<number> {
    const entries = await this.collection.listByUser(userId);
    const unlocked = entries.filter((e) => e.unlocked);
    let count = 0;
    for (const e of unlocked) {
      const t = await this.taxa.get(e.taxonId);
      if (t && t.group === group) count++;
    }
    return count;
  }

  private async awardBadge(
    userId: UserId,
    def: BadgeDefinition,
    now: Date,
  ): Promise<void> {
    const badge: EarnedBadge = {
      userId,
      badgeId: def.id,
      earnedAt: now.toISOString(),
    };
    await this.badges.award(badge);
    // 배지 자체의 XP 는 레벨 재계산 루프를 피하려 여기서 직접 반영하지 않는다.
    // (배지 XP 를 원하면 grant 경로로 별도 호출.)
  }
}
