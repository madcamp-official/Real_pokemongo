/**
 * In-memory 저장소 구현 (개발/데모/테스트용).
 *
 * 프로덕션에서는 각 포트를 관리형 DB 어댑터로 교체한다.
 * TODO(제공 필요): DATABASE_URL 채운 뒤 Postgres 등 어댑터 구현.
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
  AudioSightingId,
} from "../../domain/types.js";
import type { Quest, QuestProgress } from "../../quest/questTypes.js";
import type { EarnedBadge } from "../../rewards/rewardTypes.js";
import type { GardenLayout } from "../../garden/gardenTypes.js";
import { buildDefaultTiles } from "../../garden/gardenTypes.js";
import type { AudioSighting } from "../../audio/audioTypes.js";
import type { AudioIdentificationResult } from "../../audio/identification/audioIdentificationTypes.js";
import type {
  UserRepository,
  TaxonRepository,
  ObservationRepository,
  CollectionRepository,
  QuestRepository,
  BadgeRepository,
  CredentialRepository,
  ConsentRepository,
  CreatureRepository,
  GardenRepository,
  AudioSightingRepository,
  AudioIdentificationResultRepository,
} from "../ports.js";

export class InMemoryUserRepo implements UserRepository {
  private m = new Map<string, User>();
  async save(u: User) {
    this.m.set(u.id, u);
  }
  async get(id: UserId) {
    return this.m.get(id) ?? null;
  }
  async delete(id: UserId) {
    return this.m.delete(id);
  }
}

export class InMemoryTaxonRepo implements TaxonRepository {
  private byId = new Map<string, Taxon>();
  private bySci = new Map<string, Taxon>();

  async get(id: TaxonId) {
    return this.byId.get(id) ?? null;
  }
  async findBySciName(sciName: string) {
    return this.bySci.get(sciName.toLowerCase()) ?? null;
  }
  async list(filter?: { group?: TaxonGroup; season?: Season; habitat?: Habitat }) {
    let out = [...this.byId.values()];
    if (filter?.group) out = out.filter((t) => t.group === filter.group);
    if (filter?.season) out = out.filter((t) => t.seasonTags.includes(filter.season!));
    if (filter?.habitat)
      out = out.filter((t) => t.habitatTags.includes(filter.habitat!));
    return out;
  }
  async count(filter?: { season?: Season; habitat?: Habitat }) {
    return (await this.list(filter)).length;
  }
  async upsertMany(taxa: Taxon[]) {
    for (const t of taxa) {
      this.byId.set(t.id, t);
      this.bySci.set(t.sciName.toLowerCase(), t);
    }
  }
}

export class InMemoryObservationRepo implements ObservationRepository {
  private m = new Map<string, Observation>();
  async save(o: Observation) {
    this.m.set(o.id, o);
  }
  async get(id: ObservationId) {
    return this.m.get(id) ?? null;
  }
  async listByUser(userId: UserId) {
    return [...this.m.values()]
      .filter((o) => o.userId === userId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  async listByUserSince(userId: UserId, sinceIso: string) {
    return (await this.listByUser(userId)).filter((o) => o.timestamp >= sinceIso);
  }
  async deleteByUser(userId: UserId) {
    let n = 0;
    for (const [k, v] of this.m) {
      if (v.userId === userId) {
        this.m.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemoryCollectionRepo implements CollectionRepository {
  private m = new Map<string, CollectionEntry>();
  private key(userId: UserId, taxonId: TaxonId) {
    return `${userId}::${taxonId}`;
  }
  async get(userId: UserId, taxonId: TaxonId) {
    return this.m.get(this.key(userId, taxonId)) ?? null;
  }
  async save(entry: CollectionEntry) {
    this.m.set(this.key(entry.userId, entry.taxonId), entry);
  }
  async listByUser(userId: UserId) {
    return [...this.m.values()].filter((e) => e.userId === userId);
  }
  async deleteByUser(userId: UserId) {
    let n = 0;
    for (const [k, v] of this.m) {
      if (v.userId === userId) {
        this.m.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemoryQuestRepo implements QuestRepository {
  private quests = new Map<string, Quest>();
  private progress = new Map<string, QuestProgress>();
  private pkey(userId: UserId, questId: string) {
    return `${userId}::${questId}`;
  }
  async listActive() {
    return [...this.quests.values()];
  }
  async get(id: string) {
    return this.quests.get(id) ?? null;
  }
  async getProgress(userId: UserId, questId: string) {
    return this.progress.get(this.pkey(userId, questId)) ?? null;
  }
  async saveProgress(p: QuestProgress) {
    this.progress.set(this.pkey(p.userId, p.questId), p);
  }
  async listProgressByUser(userId: UserId) {
    return [...this.progress.values()].filter((p) => p.userId === userId);
  }
  async upsertMany(quests: Quest[]) {
    for (const q of quests) this.quests.set(q.id, q);
  }
  async deleteProgressByUser(userId: UserId) {
    let n = 0;
    for (const [k, v] of this.progress) {
      if (v.userId === userId) {
        this.progress.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemoryBadgeRepo implements BadgeRepository {
  private m: EarnedBadge[] = [];
  async listByUser(userId: UserId) {
    return this.m.filter((b) => b.userId === userId);
  }
  async award(badge: EarnedBadge) {
    // 멱등: 이미 해금돼 있으면(existing) 덮어쓰지 않는다 — claimedAt 등 기존 상태 보존.
    const existing = this.m.find((b) => b.userId === badge.userId && b.badgeId === badge.badgeId);
    if (existing) return;
    this.m.push(badge);
  }
  async has(userId: UserId, badgeId: string) {
    return this.m.some((b) => b.userId === userId && b.badgeId === badgeId);
  }
  async get(userId: UserId, badgeId: string) {
    return this.m.find((b) => b.userId === userId && b.badgeId === badgeId) ?? null;
  }
  async markClaimed(userId: UserId, badgeId: string, claimedAt: string) {
    const b = this.m.find((x) => x.userId === userId && x.badgeId === badgeId);
    if (!b) return false;
    b.claimedAt = claimedAt;
    return true;
  }
  async deleteByUser(userId: UserId) {
    const before = this.m.length;
    this.m = this.m.filter((b) => b.userId !== userId);
    return before - this.m.length;
  }
}

export class InMemoryCreatureRepo implements CreatureRepository {
  private m = new Map<string, Creature>();
  async save(c: Creature) {
    this.m.set(c.id, c);
  }
  async get(id: CreatureId) {
    return this.m.get(id) ?? null;
  }
  async getByUserAndTaxon(userId: UserId, taxonId: TaxonId) {
    return (
      [...this.m.values()].find((c) => c.userId === userId && c.taxonId === taxonId) ?? null
    );
  }
  async listByUser(userId: UserId) {
    return [...this.m.values()].filter((c) => c.userId === userId);
  }
  async deleteByUser(userId: UserId) {
    let n = 0;
    for (const [k, v] of this.m) {
      if (v.userId === userId) {
        this.m.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemoryCredentialRepo implements CredentialRepository {
  private byUser = new Map<string, Credential>();
  private byEmail = new Map<string, Credential>();
  async save(c: Credential) {
    this.byUser.set(c.userId, c);
    this.byEmail.set(c.email.toLowerCase(), c);
  }
  async findByEmail(email: string) {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }
  async getByUser(userId: UserId) {
    return this.byUser.get(userId) ?? null;
  }
  async deleteByUser(userId: UserId) {
    const c = this.byUser.get(userId);
    if (!c) return false;
    this.byUser.delete(userId);
    this.byEmail.delete(c.email.toLowerCase());
    return true;
  }
}

export class InMemoryConsentRepo implements ConsentRepository {
  private m = new Map<string, ConsentRecord>();
  async save(c: ConsentRecord) {
    this.m.set(c.userId, c);
  }
  async getByUser(userId: UserId) {
    return this.m.get(userId) ?? null;
  }
  async deleteByUser(userId: UserId) {
    return this.m.delete(userId);
  }
}

export class InMemoryGardenRepo implements GardenRepository {
  private m = new Map<string, GardenLayout>();
  async getLayout(userId: UserId) {
    return this.m.get(userId) ?? { tiles: buildDefaultTiles(), placements: [] };
  }
  async saveLayout(userId: UserId, layout: GardenLayout) {
    this.m.set(userId, layout);
  }
  async deleteByUser(userId: UserId) {
    // Postgres 어댑터와 동일한 의미(실제 삭제된 타일 행 수)를 맞추려 저장돼 있던 타일
    // 개수를 반환한다 — 저장한 적 없는 사용자는 getLayout이 기본 정원을 "가상으로만"
    // 돌려줄 뿐 여기엔 아무것도 없으므로 0.
    const layout = this.m.get(userId);
    this.m.delete(userId);
    return layout?.tiles.length ?? 0;
  }
}

export class InMemoryAudioSightingRepo implements AudioSightingRepository {
  private m = new Map<string, AudioSighting>();
  async create(sighting: AudioSighting) {
    this.m.set(sighting.id, sighting);
  }
  async get(id: AudioSightingId) {
    return this.m.get(id) ?? null;
  }
  async findByClientRecordingId(userId: UserId, clientRecordingId: string) {
    return (
      [...this.m.values()].find(
        (s) => s.userId === userId && s.clientRecordingId === clientRecordingId,
      ) ?? null
    );
  }
  async deleteByUser(userId: UserId) {
    let n = 0;
    for (const [k, v] of this.m) {
      if (v.userId === userId) {
        this.m.delete(k);
        n++;
      }
    }
    return n;
  }
  async listByUser(userId: UserId) {
    return [...this.m.values()].filter((s) => s.userId === userId);
  }
  async findExpired(now: Date, limit: number) {
    return [...this.m.values()]
      .filter((s) => new Date(s.expiresAt).getTime() <= now.getTime())
      .slice(0, limit);
  }
  async deleteById(id: AudioSightingId) {
    this.m.delete(id);
  }
}

/** 6단계: `/audio/identify` 결과 스냅샷. */
export class InMemoryAudioIdentificationResultRepo implements AudioIdentificationResultRepository {
  private m = new Map<string, AudioIdentificationResult>();
  async upsert(result: AudioIdentificationResult) {
    this.m.set(result.audioSightingId, result);
  }
  async get(audioSightingId: AudioSightingId) {
    return this.m.get(audioSightingId) ?? null;
  }
}
