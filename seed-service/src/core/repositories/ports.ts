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
} from "../domain/types.js";
import type { Quest, QuestProgress } from "../quest/questTypes.js";
import type { EarnedBadge } from "../rewards/rewardTypes.js";

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
  award(badge: EarnedBadge): Promise<void>;
  has(userId: UserId, badgeId: string): Promise<boolean>;
  deleteByUser(userId: UserId): Promise<number>;
}
