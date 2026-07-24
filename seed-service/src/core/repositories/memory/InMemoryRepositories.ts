/**
 * In-memory 저장소 구현 (개발/데모/테스트용).
 *
 * 프로덕션에서는 각 포트를 관리형 DB 어댑터로 교체한다.
 * TODO(제공 필요): DATABASE_URL 채운 뒤 Postgres 등 어댑터 구현.
 */
import type {
  Guardian,
  GuardianId,
  ChildProfile,
  ChildId,
  Taxon,
  TaxonId,
  Observation,
  ObservationId,
  CollectionEntry,
  TaxonGroup,
  Season,
  Habitat,
} from "../../domain/types.js";
import type { Quest, QuestProgress } from "../../quest/questTypes.js";
import type { EarnedBadge } from "../../rewards/rewardTypes.js";
import type {
  GuardianRepository,
  ChildRepository,
  TaxonRepository,
  ObservationRepository,
  CollectionRepository,
  QuestRepository,
  BadgeRepository,
} from "../ports.js";

export class InMemoryGuardianRepo implements GuardianRepository {
  private m = new Map<string, Guardian>();
  async save(g: Guardian) {
    this.m.set(g.id, g);
  }
  async get(id: GuardianId) {
    return this.m.get(id) ?? null;
  }
  async delete(id: GuardianId) {
    return this.m.delete(id);
  }
}

export class InMemoryChildRepo implements ChildRepository {
  private m = new Map<string, ChildProfile>();
  async save(c: ChildProfile) {
    this.m.set(c.id, c);
  }
  async get(id: ChildId) {
    return this.m.get(id) ?? null;
  }
  async listByGuardian(guardianId: GuardianId) {
    return [...this.m.values()].filter((c) => c.guardianId === guardianId);
  }
  async delete(id: ChildId) {
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
  async listByChild(childId: ChildId) {
    return [...this.m.values()]
      .filter((o) => o.childId === childId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  async listByChildSince(childId: ChildId, sinceIso: string) {
    return (await this.listByChild(childId)).filter((o) => o.timestamp >= sinceIso);
  }
  async deleteByChild(childId: ChildId) {
    let n = 0;
    for (const [k, v] of this.m) {
      if (v.childId === childId) {
        this.m.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemoryCollectionRepo implements CollectionRepository {
  private m = new Map<string, CollectionEntry>();
  private key(childId: ChildId, taxonId: TaxonId) {
    return `${childId}::${taxonId}`;
  }
  async get(childId: ChildId, taxonId: TaxonId) {
    return this.m.get(this.key(childId, taxonId)) ?? null;
  }
  async save(entry: CollectionEntry) {
    this.m.set(this.key(entry.childId, entry.taxonId), entry);
  }
  async listByChild(childId: ChildId) {
    return [...this.m.values()].filter((e) => e.childId === childId);
  }
  async deleteByChild(childId: ChildId) {
    let n = 0;
    for (const [k, v] of this.m) {
      if (v.childId === childId) {
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
  private pkey(childId: ChildId, questId: string) {
    return `${childId}::${questId}`;
  }
  async listActive() {
    return [...this.quests.values()];
  }
  async get(id: string) {
    return this.quests.get(id) ?? null;
  }
  async getProgress(childId: ChildId, questId: string) {
    return this.progress.get(this.pkey(childId, questId)) ?? null;
  }
  async saveProgress(p: QuestProgress) {
    this.progress.set(this.pkey(p.childId, p.questId), p);
  }
  async listProgressByChild(childId: ChildId) {
    return [...this.progress.values()].filter((p) => p.childId === childId);
  }
  async upsertMany(quests: Quest[]) {
    for (const q of quests) this.quests.set(q.id, q);
  }
  async deleteProgressByChild(childId: ChildId) {
    let n = 0;
    for (const [k, v] of this.progress) {
      if (v.childId === childId) {
        this.progress.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class InMemoryBadgeRepo implements BadgeRepository {
  private m: EarnedBadge[] = [];
  async listByChild(childId: ChildId) {
    return this.m.filter((b) => b.childId === childId);
  }
  async award(badge: EarnedBadge) {
    this.m.push(badge);
  }
  async has(childId: ChildId, badgeId: string) {
    return this.m.some((b) => b.childId === childId && b.badgeId === badgeId);
  }
  async deleteByChild(childId: ChildId) {
    const before = this.m.length;
    this.m = this.m.filter((b) => b.childId !== childId);
    return before - this.m.length;
  }
}
