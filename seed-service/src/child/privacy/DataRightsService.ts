/**
 * 데이터 주체 권리 서비스 (체크리스트 §5.6 [치명] — 삭제권·이동권 이행).
 *
 * 사용자의 개인정보는 본인이 열람·삭제를 요구할 수 있고, 서비스는 이를 **실제로**
 * 이행해야 한다. "삭제 버튼은 있는데 데이터는 남아있다"가 전형적 사고 유형이므로,
 * 이 서비스는:
 *
 *  1) 사용자 데이터를 담는 **모든 저장소를 명시적으로 열거**해서 지운다. 새 저장소가
 *     생기면 이 파일과 삭제 완전성 골든 테스트에 반드시 추가할 것.
 *  2) 삭제 건수를 담은 **파기 리포트(ErasureReport)** 를 반환해 검증 가능하게 한다.
 *  3) 모든 진입점은 AuthContext 필수 — 남의 계정을 지우거나 내보내는 IDOR 불가.
 *
 * v1.2: 보호자·자녀 2단계 구조가 단일 계정으로 통합되면서, "자녀 목록을 순회하며 각각
 * 파기 후 보호자 계정 파기"하던 2단계 흐름이 "본인 계정 하나를 파기"하는 1단계로
 * 단순화됐다(더 이상 별도 대상 id 를 받지 않고 항상 ctx.userId 를 대상으로 한다).
 *
 * 경계(정직한 한계):
 *  - 미디어 blob 파기: 실제 스토리지가 아직 없으므로, 지워야 할 MediaRef 목록을
 *    리포트로 반환한다. TODO(제공 필요): 스토리지 어댑터 연결 시 이 목록의 blob 을
 *    실제 파기하는 단계를 붙일 것.
 *  - 백업·로그 파기: 인프라 계층 소관. 체크리스트 §5.6 참조(백업에도 잔존 금지).
 */
import type {
  MediaRef,
  Observation,
  CollectionEntry,
} from "../../core/domain/types.js";
import type { QuestProgress } from "../../core/quest/questTypes.js";
import type { EarnedBadge } from "../../core/rewards/rewardTypes.js";
import type {
  UserRepository,
  ObservationRepository,
  CollectionRepository,
  QuestRepository,
  BadgeRepository,
  CredentialRepository,
  ConsentRepository,
} from "../../core/repositories/ports.js";
import type { AuthContext, Authorizer } from "../../core/auth/Authorization.js";

/** 이동권(내보내기) 결과 — 본인에게 전달할 데이터 사본. */
export interface UserDataExport {
  exportedAt: string;
  profile: {
    nickname: string;
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
  userId: string;
  erasedAt: string;
  deleted: {
    observations: number;
    collectionEntries: number;
    questProgress: number;
    badges: number;
    profile: boolean;
    credential: boolean;
    consent: boolean;
  };
  /** TODO(제공 필요): 스토리지 어댑터가 실제 blob 을 파기해야 할 미디어 참조 목록. */
  mediaRefsToPurge: MediaRef[];
}

export class DataRightsService {
  constructor(
    private readonly deps: {
      authorizer: Authorizer;
      users: UserRepository;
      observations: ObservationRepository;
      collection: CollectionRepository;
      quests: QuestRepository;
      badges: BadgeRepository;
      credentials: CredentialRepository;
      consent: ConsentRepository;
    },
  ) {}

  /** 이동권: 내 데이터 전체를 내보낸다(본인만). */
  async exportUserData(ctx: AuthContext): Promise<UserDataExport> {
    const user = await this.deps.authorizer.requireUser(ctx);
    const [observations, collection, questProgress, badges] = await Promise.all([
      this.deps.observations.listByUser(ctx.userId),
      this.deps.collection.listByUser(ctx.userId),
      this.deps.quests.listProgressByUser(ctx.userId),
      this.deps.badges.listByUser(ctx.userId),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        nickname: user.nickname,
        avatar: user.avatar,
        level: user.level,
        xp: user.xp,
        createdAt: user.createdAt,
      },
      observations,
      collection,
      questProgress,
      badges,
    };
  }

  /**
   * 삭제권(=회원 탈퇴): 내 계정의 데이터를 모든 저장소에서 파기한다(본인만).
   *
   * 순서가 중요하다: 종속 데이터를 먼저 지우고 **프로필을 마지막에** 지운다.
   * 중간 실패 시 프로필이 남아 있으므로 재실행(재시도)으로 마저 지울 수 있다.
   * 이미 파기된 계정에 대한 재호출은 인가 단계에서 거부된다(프로필 부재).
   */
  async eraseUserData(ctx: AuthContext): Promise<ErasureReport> {
    await this.deps.authorizer.requireUser(ctx);
    const userId = ctx.userId;

    // blob 파기 대상 미디어 참조를 삭제 전에 수집.
    const observations = await this.deps.observations.listByUser(userId);
    const mediaRefsToPurge = observations.flatMap((o) => o.media);

    // ── 사용자 데이터를 담는 모든 저장소 열거(새 저장소 추가 시 여기와 테스트에 필수 반영) ──
    const deletedObservations = await this.deps.observations.deleteByUser(userId);
    const deletedCollection = await this.deps.collection.deleteByUser(userId);
    const deletedQuestProgress = await this.deps.quests.deleteProgressByUser(userId);
    const deletedBadges = await this.deps.badges.deleteByUser(userId);
    const deletedCredential = await this.deps.credentials.deleteByUser(userId);
    const deletedConsent = await this.deps.consent.deleteByUser(userId);
    const profileDeleted = await this.deps.users.delete(userId);

    return {
      userId: userId as string,
      erasedAt: new Date().toISOString(),
      deleted: {
        observations: deletedObservations,
        collectionEntries: deletedCollection,
        questProgress: deletedQuestProgress,
        badges: deletedBadges,
        profile: profileDeleted,
        credential: deletedCredential,
        consent: deletedConsent,
      },
      mediaRefsToPurge,
    };
  }
}
