/**
 * 데이터 주체 권리 서비스 (체크리스트 §5.6 [치명] — 삭제권·이동권 이행).
 *
 * 만 14세 미만 아동의 개인정보는 법정대리인(보호자)이 열람·삭제를 요구할 수 있고,
 * 서비스는 이를 **실제로** 이행해야 한다. "삭제 버튼은 있는데 데이터는 남아있다"가
 * 전형적 사고 유형이므로, 이 서비스는:
 *
 *  1) 아동 데이터를 담는 **모든 저장소를 명시적으로 열거**해서 지운다. 새 저장소가
 *     생기면 이 파일과 삭제 완전성 골든 테스트에 반드시 추가할 것.
 *  2) 삭제 건수를 담은 **파기 리포트(ErasureReport)** 를 반환해 검증 가능하게 한다.
 *  3) 모든 진입점은 AuthContext 필수 — 남의 아이를 지우거나 내보내는 IDOR 불가.
 *
 * 경계(정직한 한계):
 *  - 미디어 blob 파기: 실제 스토리지가 아직 없으므로, 지워야 할 MediaRef 목록을
 *    리포트로 반환한다. TODO(제공 필요): 스토리지 어댑터 연결 시 이 목록의 blob 을
 *    실제 파기하는 단계를 붙일 것.
 *  - 백업·로그 파기: 인프라 계층 소관. 체크리스트 §5.6 참조(백업에도 잔존 금지).
 */
import type {
  ChildId,
  GuardianId,
  MediaRef,
  Observation,
  CollectionEntry,
  AgeBand,
} from "../../core/domain/types.js";
import type { QuestProgress } from "../../core/quest/questTypes.js";
import type { EarnedBadge } from "../../core/rewards/rewardTypes.js";
import type {
  GuardianRepository,
  ChildRepository,
  ObservationRepository,
  CollectionRepository,
  QuestRepository,
  BadgeRepository,
} from "../../core/repositories/ports.js";
import type { AuthContext, Authorizer } from "../../core/auth/Authorization.js";

/** 이동권(내보내기) 결과 — 보호자에게 전달할 아동 데이터 사본. */
export interface ChildDataExport {
  exportedAt: string;
  profile: {
    nickname: string;
    ageBand: AgeBand;
    avatar: string;
    level: number;
    xp: number;
    createdAt: string;
  };
  observations: Observation[]; // region 은 이미 시·군·구 수준 또는 null(정밀좌표 없음)
  collection: CollectionEntry[];
  questProgress: QuestProgress[];
  badges: EarnedBadge[];
}

/** 삭제권(파기) 결과 — 어디서 몇 건이 지워졌는지 검증 가능한 리포트. */
export interface ErasureReport {
  childId: string;
  erasedAt: string;
  deleted: {
    observations: number;
    collectionEntries: number;
    questProgress: number;
    badges: number;
    profile: boolean;
  };
  /** TODO(제공 필요): 스토리지 어댑터가 실제 blob 을 파기해야 할 미디어 참조 목록. */
  mediaRefsToPurge: MediaRef[];
}

export interface AccountErasureReport {
  guardianId: string;
  erasedAt: string;
  children: ErasureReport[];
  guardianDeleted: boolean;
}

export class DataRightsService {
  constructor(
    private readonly deps: {
      authorizer: Authorizer;
      guardians: GuardianRepository;
      children: ChildRepository;
      observations: ObservationRepository;
      collection: CollectionRepository;
      quests: QuestRepository;
      badges: BadgeRepository;
    },
  ) {}

  /** 이동권: 아동 데이터 전체를 내보낸다(본인 가족만). */
  async exportChildData(ctx: AuthContext, childId: ChildId): Promise<ChildDataExport> {
    const child = await this.deps.authorizer.assertOwnsChild(ctx, childId);
    const [observations, collection, questProgress, badges] = await Promise.all([
      this.deps.observations.listByChild(childId),
      this.deps.collection.listByChild(childId),
      this.deps.quests.listProgressByChild(childId),
      this.deps.badges.listByChild(childId),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        nickname: child.nickname,
        ageBand: child.ageBand,
        avatar: child.avatar,
        level: child.level,
        xp: child.xp,
        createdAt: child.createdAt,
      },
      observations,
      collection,
      questProgress,
      badges,
    };
  }

  /**
   * 삭제권: 아동 한 명의 데이터를 모든 저장소에서 파기한다(본인 가족만).
   *
   * 순서가 중요하다: 종속 데이터를 먼저 지우고 **프로필을 마지막에** 지운다.
   * 중간 실패 시 프로필이 남아 있으므로 재실행(재시도)으로 마저 지울 수 있다.
   * 이미 파기된 아이에 대한 재호출은 인가 단계에서 거부된다(프로필 부재).
   */
  async eraseChildData(ctx: AuthContext, childId: ChildId): Promise<ErasureReport> {
    await this.deps.authorizer.assertOwnsChild(ctx, childId);

    // blob 파기 대상 미디어 참조를 삭제 전에 수집.
    const observations = await this.deps.observations.listByChild(childId);
    const mediaRefsToPurge = observations.flatMap((o) => o.media);

    // ── 아동 데이터를 담는 모든 저장소 열거(새 저장소 추가 시 여기와 테스트에 필수 반영) ──
    const deletedObservations = await this.deps.observations.deleteByChild(childId);
    const deletedCollection = await this.deps.collection.deleteByChild(childId);
    const deletedQuestProgress = await this.deps.quests.deleteProgressByChild(childId);
    const deletedBadges = await this.deps.badges.deleteByChild(childId);
    const profileDeleted = await this.deps.children.delete(childId);

    return {
      childId: childId as string,
      erasedAt: new Date().toISOString(),
      deleted: {
        observations: deletedObservations,
        collectionEntries: deletedCollection,
        questProgress: deletedQuestProgress,
        badges: deletedBadges,
        profile: profileDeleted,
      },
      mediaRefsToPurge,
    };
  }

  /**
   * 회원 탈퇴: 보호자 계정과 소속 자녀 전원의 데이터를 파기한다(본인만).
   * 자녀들을 먼저 지우고 보호자 계정을 마지막에 지운다(중간 실패 시 재실행 가능).
   */
  async eraseGuardianAccount(ctx: AuthContext): Promise<AccountErasureReport> {
    // ctx 는 인증 계층이 발급한 본인 — 본인 계정만 지울 수 있다(assertSelf 는 동어반복이라 생략).
    const guardianId: GuardianId = ctx.guardianId;
    const children = await this.deps.children.listByGuardian(guardianId);

    const reports: ErasureReport[] = [];
    for (const child of children) {
      reports.push(await this.eraseChildData(ctx, child.id));
    }
    const guardianDeleted = await this.deps.guardians.delete(guardianId);

    return {
      guardianId: guardianId as string,
      erasedAt: new Date().toISOString(),
      children: reports,
      guardianDeleted,
    };
  }
}
