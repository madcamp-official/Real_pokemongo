/**
 * 저장소 포트(인터페이스). 명세서 §9 "저운영성"에 맞춰 구현체는 교체 가능하게 둔다.
 * - 개발/데모: in-memory 구현(memory/*).
 * - 프로덕션: 관리형 DB 어댑터. TODO(제공 필요): DATABASE_URL 채운 뒤 구현.
 *
 * 서비스 로직은 이 포트에만 의존하고 구체 DB를 모른다.
 */
import type {
  User,
  UserId,
  Taxon,
  TaxonId,
  Observation,
  ObservationId,
  CollectionEntry,
  TaxonGroup,
  Season,
  Habitat,
  Credential,
  ConsentRecord,
  Creature,
  CreatureId,
} from "../domain/types.js";
import type { Quest, QuestProgress } from "../quest/questTypes.js";
import type { EarnedBadge } from "../rewards/rewardTypes.js";
import type { GardenLayout } from "../garden/gardenTypes.js";

// 삭제 계약(체크리스트 §5.6 — 삭제권 이행):
// 사용자 데이터를 담는 모든 저장소는 삭제 메서드를 구현해야 한다. 프로덕션 DB 어댑터를
// 만들 때 이 포트가 삭제 구현을 강제한다. 반환값은 삭제 건수(파기 리포트 검증용).

export interface UserRepository {
  save(u: User): Promise<void>;
  get(id: UserId): Promise<User | null>;
  delete(id: UserId): Promise<boolean>;
}

export interface TaxonRepository {
  get(id: TaxonId): Promise<Taxon | null>;
  /** 학명으로 조회 — 프로바이더 결과 매핑에 사용. */
  findBySciName(sciName: string): Promise<Taxon | null>;
  /** 도감 전체 종 집합(진행률 분모). 필터로 계절/서식지/군별 부분집합. */
  list(filter?: {
    group?: TaxonGroup;
    season?: Season;
    habitat?: Habitat;
  }): Promise<Taxon[]>;
  count(filter?: { season?: Season; habitat?: Habitat }): Promise<number>;
  upsertMany(taxa: Taxon[]): Promise<void>;
}

export interface ObservationRepository {
  save(o: Observation): Promise<void>;
  get(id: ObservationId): Promise<Observation | null>;
  listByUser(userId: UserId): Promise<Observation[]>;
  /** 특정 기간(일일 한도 계산 등). */
  listByUserSince(userId: UserId, sinceIso: string): Promise<Observation[]>;
  deleteByUser(userId: UserId): Promise<number>;
}

export interface CollectionRepository {
  get(userId: UserId, taxonId: TaxonId): Promise<CollectionEntry | null>;
  save(entry: CollectionEntry): Promise<void>;
  listByUser(userId: UserId): Promise<CollectionEntry[]>;
  deleteByUser(userId: UserId): Promise<number>;
}

export interface QuestRepository {
  listActive(): Promise<Quest[]>;
  get(id: string): Promise<Quest | null>;
  getProgress(userId: UserId, questId: string): Promise<QuestProgress | null>;
  saveProgress(p: QuestProgress): Promise<void>;
  listProgressByUser(userId: UserId): Promise<QuestProgress[]>;
  upsertMany(quests: Quest[]): Promise<void>;
  deleteProgressByUser(userId: UserId): Promise<number>;
}

export interface BadgeRepository {
  listByUser(userId: UserId): Promise<EarnedBadge[]>;
  /** 해금(존재만, claimedAt 없음) 또는 이미 있으면 그대로 둔다(멱등). */
  award(badge: EarnedBadge): Promise<void>;
  has(userId: UserId, badgeId: string): Promise<boolean>;
  /** D단계: unlocked/claimed 구분을 위해 전체 레코드 조회. */
  get(userId: UserId, badgeId: string): Promise<EarnedBadge | null>;
  /** D단계: claim 시각을 기록. 대상이 없으면 false. */
  markClaimed(userId: UserId, badgeId: string, claimedAt: string): Promise<boolean>;
  deleteByUser(userId: UserId): Promise<number>;
}

/** D단계: 개체(Creature). 종당 최대 1마리 — getByUserAndTaxon으로 첫 해금 여부를 판정. */
export interface CreatureRepository {
  save(c: Creature): Promise<void>;
  get(id: CreatureId): Promise<Creature | null>;
  getByUserAndTaxon(userId: UserId, taxonId: TaxonId): Promise<Creature | null>;
  listByUser(userId: UserId): Promise<Creature[]>;
  deleteByUser(userId: UserId): Promise<number>;
}

/** C단계: 인증 자격증명(이메일+비밀번호 해시). User 와 의도적으로 분리(domain/types.ts 참고). */
export interface CredentialRepository {
  save(c: Credential): Promise<void>;
  findByEmail(email: string): Promise<Credential | null>;
  getByUser(userId: UserId): Promise<Credential | null>;
  deleteByUser(userId: UserId): Promise<boolean>;
}

/** C단계: 동의 이력(감사 추적용, F1). */
export interface ConsentRepository {
  save(c: ConsentRecord): Promise<void>;
  getByUser(userId: UserId): Promise<ConsentRecord | null>;
  deleteByUser(userId: UserId): Promise<boolean>;
}

/**
 * F16 홈가든(타일 배치). 한 번도 저장한 적 없는 사용자는 getLayout이 빈 상태가 아니라
 * 기본 정원(gardenTypes.ts의 buildDefaultTiles)을 돌려준다 — 단, DB엔 아무것도 쓰지 않는다
 * (실제로 저장은 사용자가 처음 saveLayout할 때 일어난다, "정직한 파생값" 원칙).
 * saveLayout은 항상 전체 교체(PUT 시맨틱) — 기존 타일/배치를 지우고 새로 받은 것으로 대체한다.
 */
export interface GardenRepository {
  getLayout(userId: UserId): Promise<GardenLayout>;
  saveLayout(userId: UserId, layout: GardenLayout): Promise<void>;
  /** 삭제권 이행(§5.6) — 삭제된 타일 행 수(배치는 타일 FK로 함께 지워짐). */
  deleteByUser(userId: UserId): Promise<number>;
}
