/**
 * 관찰 플로우 오케스트레이터 (명세서 §1.3 핵심 루프의 코드 구현).
 *
 *   촬영(F2) → 동정(F3) → 안전확인(F4) → 관찰기록(F9) → 도감해금(F5)
 *            → 퀘스트반영(F7) → 보상(F8)
 *
 * 게이트웨이/서비스/엔진을 조립해 "한 번의 관찰"이 일으키는 모든 상태 변화를 한 트랜잭션
 * 단위로 처리한다. 각 엔진은 여기서만 조립되고, 서로를 직접 알지 못한다(느슨한 결합).
 */
import type {
  MediaRef,
  TaxonGroup,
  TaxonRank,
} from "../core/domain/types.js";
import type { IdentificationGateway, IdentificationOutcome } from "../core/identification/IdentificationGateway.js";
import type { ObservationService } from "../core/observation/ObservationService.js";
import {
  resolveRegionForStorage,
  type Geocoder,
  type RawCoordinate,
} from "../core/observation/regionGeneralizer.js";
import type { CollectionEngine } from "../core/collection/CollectionEngine.js";
import type { QuestEngine } from "../core/quest/QuestEngine.js";
import type { RewardEngine } from "../core/rewards/RewardEngine.js";
import type { AccountService } from "./account/AccountService.js";
import type { SafetyNotice } from "../core/safety/SafetyFilter.js";
import type { AuthContext, Authorizer } from "../core/auth/Authorization.js";
import { sanitizeImages } from "../core/media/MediaSanitizer.js";

export interface ObserveRequest {
  /** 클라이언트가 올린 원시 이미지 바이트. 저장·외부 전송 전 이 플로우에서 정화된다. */
  images: Uint8Array[];
  media: MediaRef[]; // 저장소에 업로드된 사진 참조(업로드 파이프라인도 정화본만 저장할 것)
  groupHint?: TaxonGroup;
  /** 클라이언트가 보낸 정밀 좌표(선택). 저장 정책에 따라 즉시 일반화/폐기된다. */
  rawCoord?: RawCoordinate;
  season?: string;
  note?: string;
  now?: Date;
}

/** 한 번의 관찰이 만든 결과 전체. UI 는 이것으로 연출을 구성한다. */
export interface ObserveResult {
  identification: IdentificationOutcome;
  safety: SafetyNotice | null;
  /** 동정 성공(종 확정)일 때만 채워진다. */
  recorded?: {
    observationId: string;
    newlyUnlockedTaxonId?: string;
    collectionRatio: number;
    completedQuestTitles: string[];
    xpGained: number;
    newLevel: number | null;
    newBadgeTitles: string[];
  };
  /** 무료 한도 초과 등으로 동정을 진행하지 못한 경우. */
  blocked?: { reason: "daily_limit" };
}

export class ObservationFlow {
  constructor(
    private readonly deps: {
      gateway: IdentificationGateway;
      observations: ObservationService;
      collection: CollectionEngine;
      quests: QuestEngine;
      rewards: RewardEngine;
      accounts: AccountService;
      authorizer: Authorizer;
      geocoder: Geocoder;
      freeDailyLimit: number;
    },
  ) {}

  async observe(ctx: AuthContext, req: ObserveRequest): Promise<ObserveResult> {
    const now = req.now ?? new Date();

    // ── 인가: 다른 어떤 처리(한도 체크, 동정 API 호출)보다 먼저 ──────────────
    // ctx 가 실제 존재하는 계정인지 확인하고 User 를 받는다(존재하지 않는/파기된 계정으로
    // 무료 한도·유료 동정 호출을 소진시키는 비용 공격을 진입점에서 차단, 체크리스트 §1.3).
    // 단일 계정 모델에서는 이 한 번의 조회가 예전의 "소유권 검증 + 보호자 조회(2단계)"를
    // 모두 대체한다 — User 자체에 plan/locationStorageEnabled 가 있으므로 별도 조회 불필요.
    const user = await this.deps.authorizer.requireUser(ctx);

    // ── 미디어 정화: 저장·외부 전송 이전에 EXIF GPS 등 메타데이터 제거(§1.4) ──
    // 이후 게이트웨이/프로바이더는 SanitizedImage 만 받으므로, 원시 바이트가 외부
    // 동정 API 로 새어 나갈 수 없다. 미지 포맷은 여기서 예외로 거부된다.
    const sanitized = sanitizeImages(req.images).images;

    // (선택) 무료 사용자 일일 동정 한도 (명세서 §15).
    if (user.plan === "free") {
      const ok = await this.deps.observations.isWithinDailyLimit(
        ctx.userId,
        this.deps.freeDailyLimit,
        now,
      );
      if (!ok) {
        return {
          identification: this.emptyOutcome(),
          safety: null,
          blocked: { reason: "daily_limit" },
        };
      }
    }

    // ── F3 동정 ───────────────────────────────────────────────────────────
    const identification = await this.deps.gateway.identify({
      images: sanitized,
      groupHint: req.groupHint,
      season: req.season,
    });

    // 종을 '종 수준'으로 확정(high)했을 때만 도감·퀘스트·보상에 반영한다.
    //  - medium: 후보 고르기 → 아이가 고른 뒤 별도 확정 액션에서 기록(후속 엔드포인트).
    //  - fallback: 상위 분류만 알아냄 → 안내만, 도감/퀘스트 미반영.
    //  - unknown: 재촬영 안내.
    // 오동정이 도감/진행으로 굳는 것을 막는 핵심 가드(§7). 임의로 완화하지 말 것.
    if (identification.tier !== "high" || !identification.top?.taxon) {
      return { identification, safety: identification.safety };
    }

    const taxon = identification.top.taxon;

    // ── F12 위치 일반화 (정밀 좌표는 이 함수 밖으로 나가지 않는다) ───────────
    const region = await resolveRegionForStorage({
      locationStorageEnabled: user.locationStorageEnabled,
      rawCoord: req.rawCoord,
      geocoder: this.deps.geocoder,
    });

    // ── F9 관찰 기록 ──────────────────────────────────────────────────────
    const rank: TaxonRank = identification.top.rank;
    const observation = await this.deps.observations.record({
      userId: ctx.userId,
      taxonId: taxon.id,
      taxonRank: rank,
      media: req.media,
      confidence: identification.top.confidence,
      source: identification.source,
      region,
      note: req.note,
      now,
    });

    // ── F5 도감 해금 ──────────────────────────────────────────────────────
    const unlock = await this.deps.collection.applyObservation(observation);
    const progress = await this.deps.collection.progress(ctx.userId);

    // ── F7 퀘스트 반영 ────────────────────────────────────────────────────
    const questUpdates = await this.deps.quests.applyObservation(observation, now);
    const completed = questUpdates.filter((u) => u.justCompleted);

    // ── F8 보상 (관찰 + 완료 퀘스트) ──────────────────────────────────────
    const obsReward = await this.deps.rewards.onObservation(user, {
      newlyUnlocked: unlock?.newlyUnlocked ?? false,
      now,
    });
    const newBadgeTitles = [...obsReward.newBadges.map((b) => b.title)];
    let xpGained = obsReward.xpGained;
    let newLevel = obsReward.newLevel;

    for (const u of completed) {
      // 사용자의 최신 상태를 다시 읽어 XP 누적이 정확하도록.
      const fresh = (await this.deps.accounts.getUser(ctx.userId)) ?? user;
      const questReward = await this.deps.rewards.onQuestComplete(
        fresh,
        u.quest.reward.xp,
        u.quest.reward.badgeId,
        now,
      );
      xpGained += questReward.xpGained;
      newLevel = questReward.newLevel ?? newLevel;
      newBadgeTitles.push(...questReward.newBadges.map((b) => b.title));
    }

    return {
      identification,
      safety: identification.safety,
      recorded: {
        observationId: observation.id,
        newlyUnlockedTaxonId: unlock?.newlyUnlocked
          ? (taxon.id as string)
          : undefined,
        collectionRatio: progress.ratio,
        completedQuestTitles: completed.map((u) => u.quest.title),
        xpGained,
        newLevel,
        newBadgeTitles,
      },
    };
  }

  private emptyOutcome(): IdentificationOutcome {
    return {
      tier: "unknown",
      top: null,
      candidates: [],
      safety: null,
      source: "none",
      childMessage: "오늘의 관찰을 다 썼어요. 내일 또 찾아봐요!",
    };
  }
}
