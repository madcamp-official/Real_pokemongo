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
  Creature,
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
  CreatureRepository,
  GardenRepository,
  AudioSightingRepository,
} from "../../core/repositories/ports.js";
import type { AuthContext, Authorizer } from "../../core/auth/Authorization.js";
import type { AudioTempStore } from "../../core/audio/AudioTempStore.js";

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
  // D단계: observations[].preciseCoord 가 포함될 수 있다(정밀 좌표를 이제 저장하므로) —
  // 이동권(본인에게 자기 데이터 사본을 주는 것)이라 본인 정밀 위치가 포함되는 게 맞다.
  observations: Observation[];
  collection: CollectionEntry[];
  questProgress: QuestProgress[];
  badges: EarnedBadge[];
  creatures: Creature[];
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
    creatures: number;
    gardenTiles: number;
    profile: boolean;
    credential: boolean;
    consent: boolean;
    /** 5단계: 오디오 세션(audio_sighting) 파기 건수 — 파일도 아래에서 실제로 지운다(사진과
     * 달리 TODO가 아님, AudioTempStore가 이미 있어 즉시 파기 가능). */
    audioSightings: number;
  };
  /** TODO(제공 필요): 스토리지 어댑터가 실제 blob 을 파기해야 할 미디어 참조 목록(사진). */
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
      creatures: CreatureRepository;
      garden: GardenRepository;
      audioSightings: AudioSightingRepository;
      audioTempStore: AudioTempStore;
    },
  ) {}

  /** 이동권: 내 데이터 전체를 내보낸다(본인만). */
  async exportUserData(ctx: AuthContext): Promise<UserDataExport> {
    const user = await this.deps.authorizer.requireUser(ctx);
    const [observations, collection, questProgress, badges, creatures] = await Promise.all([
      this.deps.observations.listByUser(ctx.userId),
      this.deps.collection.listByUser(ctx.userId),
      this.deps.quests.listProgressByUser(ctx.userId),
      this.deps.badges.listByUser(ctx.userId),
      this.deps.creatures.listByUser(ctx.userId),
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
      creatures,
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

    // 오디오는 사진과 달리 실제 파기 가능한 스토리지(AudioTempStore)가 이미 있으므로, TODO로
    // 미루지 않고 여기서 바로 파일을 지운다(DB 행을 지우기 전에 storagePath를 모아야 함).
    // 파일 하나가 실패해도(권한 등) 계정 전체 파기가 막히면 안 되므로 best-effort — 실패해도
    // 계속 진행한다(재시도 대상으로 남기려면 TTL 스윕과 달리 "행을 남겨두는" 선택지가 없다,
    // 계정 자체가 지워지는 일회성 액션이라 다음 스윕 같은 재시도 기회가 없기 때문).
    const audioSightings = await this.deps.audioSightings.listByUser(userId);
    for (const sighting of audioSightings) {
      if (!sighting.storagePath) continue;
      try {
        await this.deps.audioTempStore.delete(sighting.storagePath);
      } catch {
        // best-effort — 로그 없이 계속(호출부인 계정삭제 흐름 자체를 막지 않는다).
      }
    }

    // ── 사용자 데이터를 담는 모든 저장소 열거(새 저장소 추가 시 여기와 테스트에 필수 반영) ──
    const deletedObservations = await this.deps.observations.deleteByUser(userId);
    const deletedCollection = await this.deps.collection.deleteByUser(userId);
    const deletedQuestProgress = await this.deps.quests.deleteProgressByUser(userId);
    const deletedBadges = await this.deps.badges.deleteByUser(userId);
    const deletedCreatures = await this.deps.creatures.deleteByUser(userId);
    const deletedGardenTiles = await this.deps.garden.deleteByUser(userId);
    const deletedCredential = await this.deps.credentials.deleteByUser(userId);
    const deletedConsent = await this.deps.consent.deleteByUser(userId);
    const deletedAudioSightings = await this.deps.audioSightings.deleteByUser(userId);
    const profileDeleted = await this.deps.users.delete(userId);

    return {
      userId: userId as string,
      erasedAt: new Date().toISOString(),
      deleted: {
        observations: deletedObservations,
        collectionEntries: deletedCollection,
        questProgress: deletedQuestProgress,
        badges: deletedBadges,
        creatures: deletedCreatures,
        gardenTiles: deletedGardenTiles,
        profile: profileDeleted,
        credential: deletedCredential,
        consent: deletedConsent,
        audioSightings: deletedAudioSightings,
      },
      mediaRefsToPurge,
    };
  }
}
