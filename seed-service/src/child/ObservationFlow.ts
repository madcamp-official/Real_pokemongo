/**
 * 관찰 플로우 오케스트레이터 (명세서 §1.3 핵심 루프의 코드 구현).
 *
 *   촬영(F2) → 동정(F3) → 안전확인(F4) → 관찰기록(F9) → 도감해금(F5)
 *            → 퀘스트반영(F7) → 보상(F8)
 *
 * 게이트웨이/서비스/엔진을 조립해 "한 번의 관찰"이 일으키는 모든 상태 변화를 한 트랜잭션
 * 단위로 처리한다. 각 엔진은 여기서만 조립되고, 서로를 직접 알지 못한다(느슨한 결합).
 *
 * C단계: "동정 이후 기록"(위치 일반화→관찰기록→도감해금→퀘스트→보상) 부분을
 * `recordIdentification()`으로 분리했다. `observe()`는 이를 내부에서 호출하도록만
 * 바뀌었을 뿐 동작은 완전히 동일하다(순수 리팩터링). 분리한 이유: HTTP 계층의
 * `POST /identify`(동정만, 기록 없음) / `POST /identify/confirm`(사용자가 고른 종을
 * 그제서야 기록) 2단계 흐름이, "동정+기록을 한 번에" 하는 `observe()` 하나로는 표현이
 * 안 되기 때문 — `recordIdentification()`은 `/identify/confirm` 핸들러가 직접 재사용한다.
 */
import type {
  MediaRef,
  ObservationModality,
  Taxon,
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
import type { SafetyNotice } from "../core/safety/SafetyFilter.js";
import type { AuthContext, Authorizer } from "../core/auth/Authorization.js";
import { sanitizeImages } from "../core/media/MediaSanitizer.js";
import { newCreatureId } from "../core/domain/ids.js";
import type { CreatureRepository } from "../core/repositories/ports.js";

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

/**
 * `recordIdentification()`의 결과 — 도감/퀘스트/보상 반영분.
 *
 * D단계 이후 의미가 바뀐 필드 주의:
 *  - `completedQuestTitles`: 이번에 조건을 채워 완료된 퀘스트 제목(UI 토스트용). **보상은
 *    아직 지급되지 않았다** — 사용자가 `POST /quests/:id/claim`을 호출해야 XP가 들어온다.
 *  - `xpGained`/`newLevel`: 오직 관찰 자체의 기본 XP(10/2)만 반영한다(변경 없이 자동 지급).
 *    퀘스트/배지 보상 XP는 포함되지 않는다.
 *  - `newBadgeTitles`: 이번에 "해금"된(조건 충족) 배지 제목. 아직 claim 전이라 XP는
 *    안 들어온 상태 — `POST /badges/claim`으로 별도 수령해야 한다.
 */
export interface RecordedOutcome {
  observationId: string;
  newlyUnlockedTaxonId?: string;
  collectionRatio: number;
  completedQuestTitles: string[];
  /** 7단계(오디오 확정) — completedQuestTitles와 같은 집합의 quest id 버전. 사진 흐름은
   * 여전히 제목만 쓰므로 이 필드를 참조하지 않는다(순수 추가, 기존 동작 무변경). */
  completedQuestIds: string[];
  xpGained: number;
  newLevel: number | null;
  newBadgeTitles: string[];
}

/** `recordIdentification()` 입력 — 이미 확정된(사용자가 고른, 또는 high 확신으로 자동 확정된) 종. */
export interface RecordIdentificationParams {
  taxon: Taxon;
  rank: TaxonRank;
  confidence: number;
  source: string;
  media: MediaRef[];
  rawCoord?: RawCoordinate;
  note?: string;
  now?: Date;
  /** 7단계(오디오 확정) — 생략하면 기존 사진 흐름과 동일하게 "photo"(기존 호출부는
   * 안 바꿔도 됨, ObservationService.record()와 같은 기본값 관례). */
  modality?: ObservationModality;
}

/** 한 번의 관찰이 만든 결과 전체. UI 는 이것으로 연출을 구성한다. */
export interface ObserveResult {
  identification: IdentificationOutcome;
  safety: SafetyNotice | null;
  /** 동정 성공(종 확정)일 때만 채워진다. */
  recorded?: RecordedOutcome;
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
      authorizer: Authorizer;
      geocoder: Geocoder;
      creatures: CreatureRepository;
      freeDailyLimit: number;
    },
  ) {}

  async observe(ctx: AuthContext, req: ObserveRequest): Promise<ObserveResult> {
    const now = req.now ?? new Date();

    // ── 인가: 다른 어떤 처리(한도 체크, 동정 API 호출)보다 먼저 ──────────────
    // ctx 가 실제 존재하는 계정인지 확인하고 User 를 받는다(존재하지 않는/파기된 계정으로
    // 무료 한도·유료 동정 호출을 소진시키는 비용 공격을 진입점에서 차단, 체크리스트 §1.3).
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

    const recorded = await this.recordIdentification(ctx, {
      taxon: identification.top.taxon,
      rank: identification.top.rank,
      confidence: identification.top.confidence,
      source: identification.source,
      media: req.media,
      rawCoord: req.rawCoord,
      note: req.note,
      now,
    });

    return { identification, safety: identification.safety, recorded };
  }

  /**
   * 이미 확정된 종을 실제로 기록한다(위치 일반화→관찰기록→도감해금→퀘스트→보상).
   * `observe()`(high 확신 자동 확정)와 HTTP `/identify/confirm`(medium 확신, 사용자가
   * 고름) 양쪽이 공유하는 경로 — 독립적으로 호출해도 안전하도록 인가를 자체적으로
   * 다시 수행한다(비용 저렴한 in-memory 조회라 observe() 경유 시 중복 조회는 무시 가능).
   */
  async recordIdentification(
    ctx: AuthContext,
    params: RecordIdentificationParams,
  ): Promise<RecordedOutcome> {
    const user = await this.deps.authorizer.requireUser(ctx);
    const now = params.now ?? new Date();
    const taxon = params.taxon;

    // ── F12 위치 일반화(region, 동의 게이트 그대로 유지) ────────────────────
    const region = await resolveRegionForStorage({
      locationStorageEnabled: user.locationStorageEnabled,
      rawCoord: params.rawCoord,
      geocoder: this.deps.geocoder,
    });

    // ── D단계: 정밀 좌표는 동의(locationStorageEnabled)와 무관하게 항상 저장한다
    // (제품 결정). 나중에 이 결정을 되돌리려면 이 한 줄만 `user.locationStorageEnabled
    // ? (params.rawCoord ?? null) : null` 형태로 감싸면 된다 — region과 달리 별도 게이트가
    // 없다는 걸 명시적으로 드러내기 위해 일부러 삼항 없이 그대로 둔다.
    const preciseCoord = params.rawCoord ?? null;

    // ── F9 관찰 기록 ──────────────────────────────────────────────────────
    const observation = await this.deps.observations.record({
      userId: ctx.userId,
      taxonId: taxon.id,
      taxonRank: params.rank,
      media: params.media,
      confidence: params.confidence,
      source: params.source,
      region,
      preciseCoord,
      note: params.note,
      now,
      modality: params.modality,
    });

    // ── F5 도감 해금 ──────────────────────────────────────────────────────
    const unlock = await this.deps.collection.applyObservation(observation);
    const progress = await this.deps.collection.progress(ctx.userId);

    // ── D단계: 개체(Creature) 자동 생성 — 이 종의 첫 해금일 때만(종당 최대 1마리,
    // newlyUnlocked가 곧 "이 유저가 이 종을 처음 해금했다"는 뜻이라 별도 중복 체크 불필요).
    if (unlock?.newlyUnlocked) {
      await this.deps.creatures.save({
        id: newCreatureId(),
        userId: ctx.userId,
        taxonId: taxon.id,
        originObservationId: observation.id,
        bond: 1,
        createdAt: now.toISOString(),
      });
    }

    // ── F7 퀘스트 반영 ────────────────────────────────────────────────────
    // completed=true만 기록한다. 보상(XP)은 더 이상 여기서 자동 지급하지 않는다 —
    // D단계 결정: 퀘스트 완료 보상은 사용자가 명시적으로 claim해야 지급된다
    // (RewardEngine.claimQuest, POST /quests/:id/claim). 관찰 자체의 기본 XP만 아래에서
    // 계속 자동 지급된다(이 부분은 이번 결정 대상이 아니었음).
    const questUpdates = await this.deps.quests.applyObservation(observation, now);
    const completed = questUpdates.filter((u) => u.justCompleted);

    // ── F8 보상: 관찰 자체의 기본 XP만 자동 지급(변경 없음). 배지는 규칙 충족 시
    // "해금"만 되고(evaluateBadges), XP는 별도 claim(POST /badges/claim) 전까지 안 들어간다.
    const obsReward = await this.deps.rewards.onObservation(user, {
      newlyUnlocked: unlock?.newlyUnlocked ?? false,
      now,
    });

    return {
      observationId: observation.id,
      newlyUnlockedTaxonId: unlock?.newlyUnlocked ? (taxon.id as string) : undefined,
      collectionRatio: progress.ratio,
      completedQuestTitles: completed.map((u) => u.quest.title),
      completedQuestIds: completed.map((u) => u.quest.id),
      xpGained: obsReward.xpGained,
      newLevel: obsReward.newLevel,
      newBadgeTitles: obsReward.newBadges.map((b) => b.title),
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
