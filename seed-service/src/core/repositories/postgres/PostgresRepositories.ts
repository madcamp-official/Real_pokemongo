/**
 * PostgreSQL 저장소 어댑터 (실DB 전환, D단계 이후).
 *
 * `InMemoryRepositories.ts`와 동일한 포트(ports.ts)를 구현한다 — 서비스 로직은 무수정.
 * 전부 파라미터화 쿼리(SQL 인젝션 방지). `db/schema.sql`과 컬럼 1:1 대응.
 *
 * badge_definition/species_content는 이 파일에 대응 리포지토리가 없다(RewardEngine/
 * ContentCardService가 지금도 SEED_BADGES/SEED_CONTENT TS 배열을 직접 쓰고 어떤 포트도
 * 거치지 않기 때문 — composition.ts 참고). 단, quest.reward_badge_id/earned_badge.badge_id가
 * badge_definition(id)를 FK로 참조하므로, 그 제약을 만족시키기 위해 `upsertBadgeDefinitions`
 * 헬퍼만 예외적으로 둔다(전체 포트가 아니라 FK 충족용 write-only 함수).
 */
import pg from "pg";
import type {
  User,
  UserId,
  Taxon,
  TaxonId,
  Observation,
  ObservationId,
  ObservedRegion,
  PreciseCoordinate,
  CollectionEntry,
  TaxonGroup,
  Season,
  Habitat,
  Credential,
  ConsentRecord,
  Creature,
  CreatureId,
} from "../../domain/types.js";
import type { Quest, QuestProgress, QuestCriteria } from "../../quest/questTypes.js";
import type { EarnedBadge, BadgeDefinition } from "../../rewards/rewardTypes.js";
import type { GardenLayout, GardenTile, CreaturePlacement, TileType } from "../../garden/gardenTypes.js";
import { buildDefaultTiles } from "../../garden/gardenTypes.js";
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
} from "../ports.js";

type Pool = pg.Pool;
type Queryable = Pool | pg.PoolClient;

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export class PgUserRepo implements UserRepository {
  constructor(private pool: Pool) {}

  async save(u: User) {
    await this.pool.query(
      `INSERT INTO app_user (id, plan, location_storage_enabled, nickname, avatar, level, xp, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         plan = EXCLUDED.plan,
         location_storage_enabled = EXCLUDED.location_storage_enabled,
         nickname = EXCLUDED.nickname,
         avatar = EXCLUDED.avatar,
         level = EXCLUDED.level,
         xp = EXCLUDED.xp`,
      [u.id, u.plan, u.locationStorageEnabled, u.nickname, u.avatar, u.level, u.xp, u.createdAt],
    );
  }

  async get(id: UserId) {
    const r = await this.pool.query(`SELECT * FROM app_user WHERE id = $1`, [id]);
    return r.rows[0] ? rowToUser(r.rows[0]) : null;
  }

  async delete(id: UserId) {
    const r = await this.pool.query(`DELETE FROM app_user WHERE id = $1 RETURNING id`, [id]);
    return (r.rowCount ?? 0) > 0;
  }
}

function rowToUser(row: any): User {
  return {
    id: row.id as UserId,
    plan: row.plan,
    locationStorageEnabled: row.location_storage_enabled,
    nickname: row.nickname,
    avatar: row.avatar,
    level: row.level,
    xp: row.xp,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Credential
// ---------------------------------------------------------------------------
export class PgCredentialRepo implements CredentialRepository {
  constructor(private pool: Pool) {}

  async save(c: Credential) {
    await this.pool.query(
      `INSERT INTO credential (user_id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash`,
      [c.userId, c.email, c.passwordHash],
    );
  }

  async findByEmail(email: string) {
    const r = await this.pool.query(`SELECT * FROM credential WHERE lower(email) = lower($1)`, [email]);
    return r.rows[0] ? rowToCredential(r.rows[0]) : null;
  }

  async getByUser(userId: UserId) {
    const r = await this.pool.query(`SELECT * FROM credential WHERE user_id = $1`, [userId]);
    return r.rows[0] ? rowToCredential(r.rows[0]) : null;
  }

  async deleteByUser(userId: UserId) {
    const r = await this.pool.query(`DELETE FROM credential WHERE user_id = $1 RETURNING user_id`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }
}

function rowToCredential(row: any): Credential {
  return { userId: row.user_id as UserId, email: row.email, passwordHash: row.password_hash };
}

// ---------------------------------------------------------------------------
// Consent (append-only log — getByUser는 최신 1건)
// ---------------------------------------------------------------------------
export class PgConsentRepo implements ConsentRepository {
  constructor(private pool: Pool) {}

  async save(c: ConsentRecord) {
    await this.pool.query(
      `INSERT INTO consent_record (user_id, privacy, location, photo, consent_version, agreed_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [c.userId, c.privacy, c.location, c.photo, c.consentVersion, c.agreedAt],
    );
  }

  async getByUser(userId: UserId) {
    const r = await this.pool.query(
      `SELECT * FROM consent_record WHERE user_id = $1 ORDER BY agreed_at DESC LIMIT 1`,
      [userId],
    );
    return r.rows[0] ? rowToConsent(r.rows[0]) : null;
  }

  async deleteByUser(userId: UserId) {
    const r = await this.pool.query(`DELETE FROM consent_record WHERE user_id = $1 RETURNING id`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }
}

function rowToConsent(row: any): ConsentRecord {
  return {
    userId: row.user_id as UserId,
    privacy: row.privacy,
    location: row.location,
    photo: row.photo,
    consentVersion: row.consent_version,
    agreedAt: new Date(row.agreed_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Taxon (+ taxon_season/habitat/risk_tag/alias)
// ---------------------------------------------------------------------------
export class PgTaxonRepo implements TaxonRepository {
  constructor(private pool: Pool) {}

  async get(id: TaxonId) {
    const rows = await fetchTaxonRows(this.pool, `WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async findBySciName(sciName: string) {
    const r = await this.pool.query(`SELECT id FROM taxon WHERE lower(sci_name) = lower($1)`, [sciName]);
    if (!r.rows[0]) return null;
    return this.get(r.rows[0].id as TaxonId);
  }

  async list(filter?: { group?: TaxonGroup; season?: Season; habitat?: Habitat }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.group) {
      params.push(filter.group);
      clauses.push(`"group" = $${params.length}`);
    }
    if (filter?.season) {
      params.push(filter.season);
      clauses.push(`id IN (SELECT taxon_id FROM taxon_season WHERE season = $${params.length})`);
    }
    if (filter?.habitat) {
      params.push(filter.habitat);
      clauses.push(`id IN (SELECT taxon_id FROM taxon_habitat WHERE habitat = $${params.length})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return fetchTaxonRows(this.pool, where, params);
  }

  async count(filter?: { season?: Season; habitat?: Habitat }) {
    return (await this.list(filter)).length;
  }

  async upsertMany(taxa: Taxon[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const t of taxa) {
        await client.query(
          `INSERT INTO taxon (id, sci_name, kor_name, rank, parent_id, "group", rarity, media_ref, size_description, active_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             sci_name = EXCLUDED.sci_name, kor_name = EXCLUDED.kor_name, rank = EXCLUDED.rank,
             parent_id = EXCLUDED.parent_id, "group" = EXCLUDED."group", rarity = EXCLUDED.rarity,
             media_ref = EXCLUDED.media_ref, size_description = EXCLUDED.size_description,
             active_time = EXCLUDED.active_time, updated_at = now()`,
          [
            t.id, t.sciName, t.korName, t.rank, t.parentId ?? null, t.group, t.rarity, t.mediaRef ?? null,
            t.sizeDescription ?? null, t.activeTime ?? null,
          ],
        );
        await client.query(`DELETE FROM taxon_season WHERE taxon_id = $1`, [t.id]);
        for (const s of t.seasonTags) {
          await client.query(`INSERT INTO taxon_season (taxon_id, season) VALUES ($1,$2)`, [t.id, s]);
        }
        await client.query(`DELETE FROM taxon_habitat WHERE taxon_id = $1`, [t.id]);
        for (const h of t.habitatTags) {
          await client.query(`INSERT INTO taxon_habitat (taxon_id, habitat) VALUES ($1,$2)`, [t.id, h]);
        }
        await client.query(`DELETE FROM taxon_risk_tag WHERE taxon_id = $1`, [t.id]);
        for (const rt of t.riskTags) {
          await client.query(`INSERT INTO taxon_risk_tag (taxon_id, risk_tag) VALUES ($1,$2)`, [t.id, rt]);
        }
        await client.query(`DELETE FROM taxon_alias WHERE taxon_id = $1`, [t.id]);
        for (const a of t.aliases ?? []) {
          await client.query(`INSERT INTO taxon_alias (taxon_id, alias) VALUES ($1,$2)`, [t.id, a]);
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

async function fetchTaxonRows(db: Queryable, where: string, params: unknown[]): Promise<Taxon[]> {
  const r = await db.query(`SELECT * FROM taxon ${where} ORDER BY id`, params);
  const rows = r.rows;
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [seasons, habitats, risks, aliases] = await Promise.all([
    db.query(`SELECT taxon_id, season FROM taxon_season WHERE taxon_id = ANY($1)`, [ids]),
    db.query(`SELECT taxon_id, habitat FROM taxon_habitat WHERE taxon_id = ANY($1)`, [ids]),
    db.query(`SELECT taxon_id, risk_tag FROM taxon_risk_tag WHERE taxon_id = ANY($1)`, [ids]),
    db.query(`SELECT taxon_id, alias FROM taxon_alias WHERE taxon_id = ANY($1)`, [ids]),
  ]);
  const groupBy = <T extends { taxon_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const row of list) {
      const arr = m.get(row.taxon_id) ?? [];
      arr.push(row);
      m.set(row.taxon_id, arr);
    }
    return m;
  };
  const bySeason = groupBy(seasons.rows);
  const byHabitat = groupBy(habitats.rows);
  const byRisk = groupBy(risks.rows);
  const byAlias = groupBy(aliases.rows);

  return rows.map((row) => {
    const alias = (byAlias.get(row.id) ?? []).map((x) => x.alias);
    return {
      id: row.id as TaxonId,
      sciName: row.sci_name,
      korName: row.kor_name,
      aliases: alias.length > 0 ? alias : undefined,
      rank: row.rank,
      parentId: row.parent_id ? (row.parent_id as TaxonId) : undefined,
      group: row.group,
      seasonTags: (bySeason.get(row.id) ?? []).map((x) => x.season),
      habitatTags: (byHabitat.get(row.id) ?? []).map((x) => x.habitat),
      riskTags: (byRisk.get(row.id) ?? []).map((x) => x.risk_tag),
      rarity: row.rarity,
      mediaRef: row.media_ref ?? undefined,
      sizeDescription: row.size_description ?? undefined,
      activeTime: row.active_time ?? undefined,
    } satisfies Taxon;
  });
}

// ---------------------------------------------------------------------------
// Observation (+ observation_media)
// ---------------------------------------------------------------------------
export class PgObservationRepo implements ObservationRepository {
  constructor(private pool: Pool) {}

  async save(o: Observation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO observation
           (id, user_id, taxon_id, taxon_rank, observed_at, region_code, region_label,
            precise_lat, precise_lng, confidence, source, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           taxon_id = EXCLUDED.taxon_id, taxon_rank = EXCLUDED.taxon_rank,
           region_code = EXCLUDED.region_code, region_label = EXCLUDED.region_label,
           precise_lat = EXCLUDED.precise_lat, precise_lng = EXCLUDED.precise_lng,
           confidence = EXCLUDED.confidence, source = EXCLUDED.source, note = EXCLUDED.note`,
        [
          o.id,
          o.userId,
          o.taxonId,
          o.taxonRank,
          o.timestamp,
          o.region?.regionCode ?? null,
          o.region?.regionLabel ?? null,
          o.preciseCoord?.lat ?? null,
          o.preciseCoord?.lng ?? null,
          o.confidence,
          o.source,
          o.note ?? null,
        ],
      );
      await client.query(`DELETE FROM observation_media WHERE observation_id = $1`, [o.id]);
      for (let i = 0; i < o.media.length; i++) {
        await client.query(
          `INSERT INTO observation_media (observation_id, ordinal, media_ref) VALUES ($1,$2,$3)`,
          [o.id, i, o.media[i]],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async get(id: ObservationId) {
    const rows = await fetchObservationRows(this.pool, `WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  async listByUser(userId: UserId) {
    return fetchObservationRows(this.pool, `WHERE user_id = $1 ORDER BY observed_at ASC`, [userId]);
  }

  async listByUserSince(userId: UserId, sinceIso: string) {
    return fetchObservationRows(
      this.pool,
      `WHERE user_id = $1 AND observed_at >= $2::timestamptz ORDER BY observed_at ASC`,
      [userId, sinceIso],
    );
  }

  async deleteByUser(userId: UserId) {
    const r = await this.pool.query(`DELETE FROM observation WHERE user_id = $1 RETURNING id`, [userId]);
    return r.rowCount ?? 0;
  }
}

async function fetchObservationRows(db: Queryable, where: string, params: unknown[]): Promise<Observation[]> {
  const r = await db.query(`SELECT * FROM observation ${where}`, params);
  if (r.rows.length === 0) return [];
  const ids = r.rows.map((row) => row.id);
  const mediaRes = await db.query(
    `SELECT observation_id, ordinal, media_ref FROM observation_media WHERE observation_id = ANY($1) ORDER BY ordinal ASC`,
    [ids],
  );
  const mediaByObs = new Map<string, string[]>();
  for (const row of mediaRes.rows) {
    const arr = mediaByObs.get(row.observation_id) ?? [];
    arr.push(row.media_ref);
    mediaByObs.set(row.observation_id, arr);
  }
  return r.rows.map((row) => rowToObservation(row, mediaByObs.get(row.id) ?? []));
}

function rowToObservation(row: any, media: string[]): Observation {
  const region: ObservedRegion | null = row.region_code
    ? { regionCode: row.region_code, regionLabel: row.region_label ?? undefined }
    : null;
  const preciseCoord: PreciseCoordinate | null =
    row.precise_lat !== null && row.precise_lng !== null
      ? { lat: Number(row.precise_lat), lng: Number(row.precise_lng) }
      : null;
  return {
    id: row.id as ObservationId,
    userId: row.user_id as UserId,
    taxonId: row.taxon_id ? (row.taxon_id as TaxonId) : null,
    taxonRank: row.taxon_rank ?? null,
    timestamp: new Date(row.observed_at).toISOString(),
    region,
    preciseCoord,
    media: media as Observation["media"],
    confidence: Number(row.confidence),
    source: row.source,
    note: row.note ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// CollectionEntry
// ---------------------------------------------------------------------------
export class PgCollectionRepo implements CollectionRepository {
  constructor(private pool: Pool) {}

  async get(userId: UserId, taxonId: TaxonId) {
    const r = await this.pool.query(
      `SELECT * FROM collection_entry WHERE user_id = $1 AND taxon_id = $2`,
      [userId, taxonId],
    );
    return r.rows[0] ? rowToCollectionEntry(r.rows[0]) : null;
  }

  async save(entry: CollectionEntry) {
    await this.pool.query(
      `INSERT INTO collection_entry (user_id, taxon_id, unlocked, first_observed_at, first_observation_id, times_observed)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, taxon_id) DO UPDATE SET
         unlocked = EXCLUDED.unlocked, first_observed_at = EXCLUDED.first_observed_at,
         first_observation_id = EXCLUDED.first_observation_id, times_observed = EXCLUDED.times_observed`,
      [
        entry.userId,
        entry.taxonId,
        entry.unlocked,
        entry.firstObservedAt ?? null,
        entry.firstObservationId ?? null,
        entry.timesObserved,
      ],
    );
  }

  async listByUser(userId: UserId) {
    const r = await this.pool.query(`SELECT * FROM collection_entry WHERE user_id = $1`, [userId]);
    return r.rows.map(rowToCollectionEntry);
  }

  async deleteByUser(userId: UserId) {
    const r = await this.pool.query(
      `DELETE FROM collection_entry WHERE user_id = $1 RETURNING taxon_id`,
      [userId],
    );
    return r.rowCount ?? 0;
  }
}

function rowToCollectionEntry(row: any): CollectionEntry {
  return {
    userId: row.user_id as UserId,
    taxonId: row.taxon_id as TaxonId,
    unlocked: row.unlocked,
    firstObservedAt: row.first_observed_at ? new Date(row.first_observed_at).toISOString() : undefined,
    firstObservationId: row.first_observation_id ? (row.first_observation_id as ObservationId) : undefined,
    timesObserved: row.times_observed,
  };
}

// ---------------------------------------------------------------------------
// Creature
// ---------------------------------------------------------------------------
export class PgCreatureRepo implements CreatureRepository {
  constructor(private pool: Pool) {}

  async save(c: Creature) {
    await this.pool.query(
      `INSERT INTO creature (id, user_id, taxon_id, nickname, origin_observation_id, bond, last_interaction_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         nickname = EXCLUDED.nickname, bond = EXCLUDED.bond,
         last_interaction_at = EXCLUDED.last_interaction_at`,
      [
        c.id,
        c.userId,
        c.taxonId,
        c.nickname ?? null,
        c.originObservationId ?? null,
        c.bond,
        c.lastInteractionAt ?? null,
        c.createdAt,
      ],
    );
  }

  async get(id: CreatureId) {
    const r = await this.pool.query(`SELECT * FROM creature WHERE id = $1`, [id]);
    return r.rows[0] ? rowToCreature(r.rows[0]) : null;
  }

  async getByUserAndTaxon(userId: UserId, taxonId: TaxonId) {
    const r = await this.pool.query(
      `SELECT * FROM creature WHERE user_id = $1 AND taxon_id = $2`,
      [userId, taxonId],
    );
    return r.rows[0] ? rowToCreature(r.rows[0]) : null;
  }

  async listByUser(userId: UserId) {
    const r = await this.pool.query(`SELECT * FROM creature WHERE user_id = $1`, [userId]);
    return r.rows.map(rowToCreature);
  }

  async deleteByUser(userId: UserId) {
    const r = await this.pool.query(`DELETE FROM creature WHERE user_id = $1 RETURNING id`, [userId]);
    return r.rowCount ?? 0;
  }
}

function rowToCreature(row: any): Creature {
  return {
    id: row.id as CreatureId,
    userId: row.user_id as UserId,
    taxonId: row.taxon_id as TaxonId,
    nickname: row.nickname ?? undefined,
    originObservationId: row.origin_observation_id ? (row.origin_observation_id as ObservationId) : undefined,
    bond: row.bond,
    lastInteractionAt: row.last_interaction_at ? new Date(row.last_interaction_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Badge (earned_badge)
// ---------------------------------------------------------------------------
export class PgBadgeRepo implements BadgeRepository {
  constructor(private pool: Pool) {}

  async listByUser(userId: UserId) {
    const r = await this.pool.query(`SELECT * FROM earned_badge WHERE user_id = $1`, [userId]);
    return r.rows.map(rowToEarnedBadge);
  }

  async award(badge: EarnedBadge) {
    // 멱등: 이미 있으면 그대로 둔다(claimedAt 등 기존 상태 보존) — InMemoryBadgeRepo와 동일.
    await this.pool.query(
      `INSERT INTO earned_badge (user_id, badge_id, earned_at, claimed_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, badge_id) DO NOTHING`,
      [badge.userId, badge.badgeId, badge.earnedAt, badge.claimedAt ?? null],
    );
  }

  async has(userId: UserId, badgeId: string) {
    const r = await this.pool.query(
      `SELECT 1 FROM earned_badge WHERE user_id = $1 AND badge_id = $2`,
      [userId, badgeId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async get(userId: UserId, badgeId: string) {
    const r = await this.pool.query(
      `SELECT * FROM earned_badge WHERE user_id = $1 AND badge_id = $2`,
      [userId, badgeId],
    );
    return r.rows[0] ? rowToEarnedBadge(r.rows[0]) : null;
  }

  async markClaimed(userId: UserId, badgeId: string, claimedAt: string) {
    const r = await this.pool.query(
      `UPDATE earned_badge SET claimed_at = $3 WHERE user_id = $1 AND badge_id = $2 RETURNING user_id`,
      [userId, badgeId, claimedAt],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async deleteByUser(userId: UserId) {
    const r = await this.pool.query(`DELETE FROM earned_badge WHERE user_id = $1 RETURNING badge_id`, [userId]);
    return r.rowCount ?? 0;
  }
}

function rowToEarnedBadge(row: any): EarnedBadge {
  return {
    userId: row.user_id as UserId,
    badgeId: row.badge_id,
    earnedAt: new Date(row.earned_at).toISOString(),
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : undefined,
  };
}

/**
 * badge_definition에 대응하는 정식 포트는 없다(RewardEngine이 SEED_BADGES를 직접 씀).
 * quest.reward_badge_id / earned_badge.badge_id가 badge_definition(id)를 FK로 참조하므로,
 * Postgres로 전환할 때 그 제약을 만족시키기 위해 저작 배지 데이터를 미리 넣어두는 용도로만 쓴다.
 */
export async function upsertBadgeDefinitions(pool: Pool, badges: BadgeDefinition[]): Promise<void> {
  for (const b of badges) {
    await pool.query(
      `INSERT INTO badge_definition (id, title, description, xp, rule, theme, icon)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description, xp = EXCLUDED.xp,
         rule = EXCLUDED.rule, theme = EXCLUDED.theme, icon = EXCLUDED.icon`,
      [b.id, b.title, b.description, b.xp, JSON.stringify(b.rule), b.theme, b.icon],
    );
  }
}

// ---------------------------------------------------------------------------
// Quest (+ quest_progress + quest_progress_taxon)
// ---------------------------------------------------------------------------
export class PgQuestRepo implements QuestRepository {
  constructor(private pool: Pool) {}

  async listActive() {
    const r = await this.pool.query(`SELECT * FROM quest ORDER BY id`);
    return r.rows.map(rowToQuest);
  }

  async get(id: string) {
    const r = await this.pool.query(`SELECT * FROM quest WHERE id = $1`, [id]);
    return r.rows[0] ? rowToQuest(r.rows[0]) : null;
  }

  async getProgress(userId: UserId, questId: string) {
    const rows = await fetchProgressRows(this.pool, `WHERE user_id = $1 AND quest_id = $2`, [userId, questId]);
    return rows[0] ?? null;
  }

  async saveProgress(p: QuestProgress) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO quest_progress (user_id, quest_id, completed, completed_at, claimed_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, quest_id) DO UPDATE SET
           completed = EXCLUDED.completed, completed_at = EXCLUDED.completed_at, claimed_at = EXCLUDED.claimed_at`,
        [p.userId, p.questId, p.completed, p.completedAt ?? null, p.claimedAt ?? null],
      );
      await client.query(`DELETE FROM quest_progress_taxon WHERE user_id = $1 AND quest_id = $2`, [
        p.userId,
        p.questId,
      ]);
      for (const taxonId of p.matchedTaxonIds) {
        await client.query(
          `INSERT INTO quest_progress_taxon (user_id, quest_id, taxon_id) VALUES ($1,$2,$3)`,
          [p.userId, p.questId, taxonId],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async listProgressByUser(userId: UserId) {
    return fetchProgressRows(this.pool, `WHERE user_id = $1`, [userId]);
  }

  async upsertMany(quests: Quest[]) {
    for (const q of quests) {
      await this.pool.query(
        `INSERT INTO quest
           (id, type, title, description, distinct_taxa, crit_season, crit_habitat, crit_group,
            crit_rarity, crit_tag_any, reward_xp, reward_badge_id, reward_cosmetic, active_from,
            active_to, chapter, curriculum_tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type, title = EXCLUDED.title, description = EXCLUDED.description,
           distinct_taxa = EXCLUDED.distinct_taxa, crit_season = EXCLUDED.crit_season,
           crit_habitat = EXCLUDED.crit_habitat, crit_group = EXCLUDED.crit_group,
           crit_rarity = EXCLUDED.crit_rarity, crit_tag_any = EXCLUDED.crit_tag_any,
           reward_xp = EXCLUDED.reward_xp, reward_badge_id = EXCLUDED.reward_badge_id,
           reward_cosmetic = EXCLUDED.reward_cosmetic, active_from = EXCLUDED.active_from,
           active_to = EXCLUDED.active_to, chapter = EXCLUDED.chapter,
           curriculum_tags = EXCLUDED.curriculum_tags`,
        [
          q.id,
          q.type,
          q.title,
          q.description,
          q.criteria.distinctTaxa,
          q.criteria.season ?? null,
          q.criteria.habitat ?? null,
          q.criteria.group ?? null,
          q.criteria.rarity ?? null,
          q.criteria.tagAny ?? [],
          q.reward.xp,
          q.reward.badgeId ?? null,
          q.reward.cosmetic ?? null,
          q.activeFrom,
          q.activeTo ?? null,
          q.chapter ?? null,
          q.curriculumTags ?? [],
        ],
      );
    }
  }

  async deleteProgressByUser(userId: UserId) {
    const r = await this.pool.query(`DELETE FROM quest_progress WHERE user_id = $1 RETURNING quest_id`, [
      userId,
    ]);
    return r.rowCount ?? 0;
  }
}

async function fetchProgressRows(db: Queryable, where: string, params: unknown[]): Promise<QuestProgress[]> {
  const r = await db.query(`SELECT * FROM quest_progress ${where}`, params);
  if (r.rows.length === 0) return [];
  const taxonRows = await db.query(
    `SELECT user_id, quest_id, taxon_id FROM quest_progress_taxon
     WHERE (user_id, quest_id) IN (${r.rows.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(",")})`,
    r.rows.flatMap((row) => [row.user_id, row.quest_id]),
  );
  const key = (userId: string, questId: string) => `${userId}::${questId}`;
  const matchedByKey = new Map<string, string[]>();
  for (const row of taxonRows.rows) {
    const k = key(row.user_id, row.quest_id);
    const arr = matchedByKey.get(k) ?? [];
    arr.push(row.taxon_id);
    matchedByKey.set(k, arr);
  }
  return r.rows.map((row) => ({
    userId: row.user_id as UserId,
    questId: row.quest_id,
    matchedTaxonIds: matchedByKey.get(key(row.user_id, row.quest_id)) ?? [],
    completed: row.completed,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : undefined,
  }));
}

function rowToQuest(row: any): Quest {
  const criteria: QuestCriteria = {
    distinctTaxa: row.distinct_taxa,
    season: row.crit_season ?? undefined,
    habitat: row.crit_habitat ?? undefined,
    group: row.crit_group ?? undefined,
    rarity: row.crit_rarity ?? undefined,
    tagAny: row.crit_tag_any?.length > 0 ? row.crit_tag_any : undefined,
  };
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    criteria,
    reward: {
      xp: row.reward_xp,
      badgeId: row.reward_badge_id ?? undefined,
      cosmetic: row.reward_cosmetic ?? undefined,
    },
    activeFrom: new Date(row.active_from).toISOString(),
    activeTo: row.active_to ? new Date(row.active_to).toISOString() : undefined,
    chapter: row.chapter ?? undefined,
    curriculumTags: row.curriculum_tags?.length > 0 ? row.curriculum_tags : undefined,
  };
}

// ---------------------------------------------------------------------------
// Garden (garden_tile + creature_placement) — F16
// ---------------------------------------------------------------------------
export class PgGardenRepo implements GardenRepository {
  constructor(private pool: Pool) {}

  async getLayout(userId: UserId): Promise<GardenLayout> {
    const tileRows = await this.pool.query(
      `SELECT "row", col, type FROM garden_tile WHERE user_id = $1`,
      [userId],
    );
    // 저장한 적 없는 사용자 — 기본 정원을 가상으로 돌려준다(DB엔 안 씀, ports.ts 계약 참고).
    if (tileRows.rows.length === 0) {
      return { tiles: buildDefaultTiles(), placements: [] };
    }
    const tiles: GardenTile[] = tileRows.rows.map((r) => ({
      row: r.row,
      col: r.col,
      type: r.type as TileType,
    }));
    const placementRows = await this.pool.query(
      `SELECT "row", col, creature_id FROM creature_placement WHERE user_id = $1`,
      [userId],
    );
    const placements: CreaturePlacement[] = placementRows.rows.map((r) => ({
      row: r.row,
      col: r.col,
      creatureId: r.creature_id as CreatureId,
    }));
    return { tiles, placements };
  }

  /**
   * 전체 교체(PUT 시맨틱): 기존 타일/배치를 지우고 새로 받은 것으로 대체한다.
   * 타일을 먼저 넣어야 creature_placement의 (user_id,row,col)→garden_tile FK가 성립한다.
   */
  async saveLayout(userId: UserId, layout: GardenLayout): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // creature_placement이 garden_tile을 FK로 참조하므로 배치를 먼저 지운다.
      await client.query(`DELETE FROM creature_placement WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM garden_tile WHERE user_id = $1`, [userId]);
      for (const t of layout.tiles) {
        await client.query(
          `INSERT INTO garden_tile (user_id, "row", col, type) VALUES ($1,$2,$3,$4)`,
          [userId, t.row, t.col, t.type],
        );
      }
      for (const p of layout.placements) {
        await client.query(
          `INSERT INTO creature_placement (user_id, "row", col, creature_id) VALUES ($1,$2,$3,$4)`,
          [userId, p.row, p.col, p.creatureId],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteByUser(userId: UserId): Promise<number> {
    // creature_placement은 garden_tile ON DELETE CASCADE라 타일만 지워도 함께 지워지지만,
    // 파기 리포트가 "삭제 건수"를 요구하므로(§5.6) 명시적으로 지우고 그 건수를 반환한다.
    const r = await this.pool.query(`DELETE FROM garden_tile WHERE user_id = $1 RETURNING "row"`, [
      userId,
    ]);
    return r.rowCount ?? 0;
  }
}
