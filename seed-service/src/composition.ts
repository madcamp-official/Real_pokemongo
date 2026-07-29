/**
 * 조립 루트(Composition Root).
 *
 * 모든 의존성을 여기 한 곳에서 조립한다. 프로바이더/저장소를 바꾸는 일은 이 파일만
 * 수정하면 된다(명세서 §9의 "교체가 코드 1곳 변경" 원칙).
 *
 * - 동정 API 키가 있으면 실제 프로바이더를, 없으면 MockProvider 를 우선순위 뒤에 둔다.
 * - 저장소는 지금 in-memory. 프로덕션은 DB 어댑터로 교체(TODO: DATABASE_URL).
 */
import pg from "pg";
import { loadConfig, type AppConfig } from "./config/index.js";
import {
  InMemoryUserRepo,
  InMemoryTaxonRepo,
  InMemoryObservationRepo,
  InMemoryCollectionRepo,
  InMemoryQuestRepo,
  InMemoryBadgeRepo,
  InMemoryCredentialRepo,
  InMemoryConsentRepo,
  InMemoryCreatureRepo,
  InMemoryGardenRepo,
} from "./core/repositories/memory/InMemoryRepositories.js";
import {
  PgUserRepo,
  PgTaxonRepo,
  PgObservationRepo,
  PgCollectionRepo,
  PgQuestRepo,
  PgBadgeRepo,
  PgCredentialRepo,
  PgConsentRepo,
  PgCreatureRepo,
  PgGardenRepo,
  upsertBadgeDefinitions,
} from "./core/repositories/postgres/PostgresRepositories.js";
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
} from "./core/repositories/ports.js";
import { LocalDiskMediaStore } from "./core/media/LocalDiskMediaStore.js";
import { PendingSightingStore } from "./core/observation/PendingSightingStore.js";
import { IdentificationGateway } from "./core/identification/IdentificationGateway.js";
import type { IdentificationProvider } from "./core/identification/IdentificationProvider.js";
import { MockProvider } from "./core/identification/providers/MockProvider.js";
import { PlantIdProvider } from "./core/identification/providers/PlantIdProvider.js";
import { PlantNetProvider } from "./core/identification/providers/PlantNetProvider.js";
import { BioClipProvider } from "./core/identification/providers/BioClipProvider.js";
import { ObservationService } from "./core/observation/ObservationService.js";
import { StubGridGeocoder } from "./core/observation/regionGeneralizer.js";
import { Authorizer } from "./core/auth/Authorization.js";
import { CollectionEngine } from "./core/collection/CollectionEngine.js";
import { QuestEngine } from "./core/quest/QuestEngine.js";
import { RewardEngine } from "./core/rewards/RewardEngine.js";
import { AccountService } from "./child/account/AccountService.js";
import { ContentCardService } from "./child/content/ContentCardService.js";
import { DataRightsService } from "./child/privacy/DataRightsService.js";
import { ObservationFlow } from "./child/ObservationFlow.js";
import { ProfessorService } from "./core/professor/ProfessorService.js";
import { buildProfessorService } from "./core/professor/ProfessorRuntime.js";
import {
  SEED_TAXA,
  SEED_QUESTS,
  SEED_BADGES,
  SEED_CONTENT,
} from "./seed/seedData.js";

export interface App {
  config: AppConfig;
  repos: {
    users: UserRepository;
    taxa: TaxonRepository;
    observations: ObservationRepository;
    collection: CollectionRepository;
    quests: QuestRepository;
    badges: BadgeRepository;
    credentials: CredentialRepository;
    consent: ConsentRepository;
    creatures: CreatureRepository;
    garden: GardenRepository;
  };
  /** DATABASE_URL이 채워져 실Postgres로 붙었을 때만 존재. graceful shutdown 대상(serve.ts). */
  dbPool?: pg.Pool;
  mock: MockProvider; // 데모에서 시나리오 주입용
  gateway: IdentificationGateway;
  authorizer: Authorizer;
  accounts: AccountService;
  content: ContentCardService;
  professor: ProfessorService;
  collection: CollectionEngine;
  quests: QuestEngine;
  rewards: RewardEngine;
  dataRights: DataRightsService;
  flow: ObservationFlow;
  /** C단계: HTTP 계층 전용 조각(사진 로컬 저장, 업로드~동정확정 임시 상태). */
  mediaStore: LocalDiskMediaStore;
  pendingSightings: PendingSightingStore;
}

function buildInMemoryRepos(): App["repos"] {
  return {
    users: new InMemoryUserRepo(),
    taxa: new InMemoryTaxonRepo(),
    observations: new InMemoryObservationRepo(),
    collection: new InMemoryCollectionRepo(),
    quests: new InMemoryQuestRepo(),
    badges: new InMemoryBadgeRepo(),
    credentials: new InMemoryCredentialRepo(),
    consent: new InMemoryConsentRepo(),
    creatures: new InMemoryCreatureRepo(),
    garden: new InMemoryGardenRepo(),
  };
}

export async function buildApp(config: AppConfig = loadConfig()): Promise<App> {
  // --- 저장소 ---
  // DATABASE_URL이 채워져 있으면 Postgres(GPU 서버, .env.example 참고), 비어 있으면(기본)
  // InMemory. 개발 환경에서는 DB 터널이 닫혀 연결할 수 없을 때도 InMemory로 폴백하고,
  // 프로덕션에서는 연결 실패를 그대로 올려 잘못된 상태로 부팅하지 않는다.
  let dbPool: pg.Pool | undefined;
  let repos: App["repos"];
  if (config.database.url) {
    const candidatePool = new pg.Pool({
      connectionString: config.database.url,
      connectionTimeoutMillis: 3_000,
    });
    try {
      // 터널이 닫혀 있으면 첫 시드 쿼리까지 기다리지 않고 여기서 명확히 판별한다.
      await candidatePool.query("SELECT 1");
      dbPool = candidatePool;
      repos = {
        users: new PgUserRepo(dbPool),
        taxa: new PgTaxonRepo(dbPool),
        observations: new PgObservationRepo(dbPool),
        collection: new PgCollectionRepo(dbPool),
        quests: new PgQuestRepo(dbPool),
        badges: new PgBadgeRepo(dbPool),
        credentials: new PgCredentialRepo(dbPool),
        consent: new PgConsentRepo(dbPool),
        creatures: new PgCreatureRepo(dbPool),
        garden: new PgGardenRepo(dbPool),
      };
      // quest.reward_badge_id / earned_badge.badge_id가 badge_definition(id)를 FK로 참조하므로
      // (db/schema.sql), 실제 배지 저작 데이터를 먼저 채워야 quest 업서트/배지 해금이 FK를 만족한다.
      await upsertBadgeDefinitions(dbPool, SEED_BADGES);
    } catch (error) {
      await candidatePool.end().catch(() => undefined);
      if (config.nodeEnv === "production") throw error;
      console.warn(
        "[db] PostgreSQL에 연결하지 못해 개발용 InMemory 저장소로 전환합니다. " +
          "DB 터널과 DATABASE_URL을 확인해 주세요.",
      );
      repos = buildInMemoryRepos();
    }
  } else {
    repos = buildInMemoryRepos();
  }

  // --- 시드 로드 ---
  await repos.taxa.upsertMany(SEED_TAXA);
  await repos.quests.upsertMany(SEED_QUESTS);
  const content = new ContentCardService();
  for (const c of SEED_CONTENT) content.upsert(c);

  // --- 동정 프로바이더 우선순위 ---
  // 설정된(키 있는) 실제 프로바이더 먼저, 그다음 Mock(개발 폴백).
  // bioclip이 맨 앞: plant.id/plantnet은 아직 identify() 미구현(벤더 스펙 대기)이라
  // isConfigured()=false로 항상 스킵되므로 순서가 실질적인 영향은 없지만, bioclip이
  // 지금 유일하게 실제로 동작하는 프로바이더임을 명시적으로 드러낸다.
  const bioclip = new BioClipProvider(config.identification.bioclip);
  const plantId = new PlantIdProvider(config.identification.plantId);
  const plantNet = new PlantNetProvider(config.identification.plantNet);
  const mock = new MockProvider();
  const providers: IdentificationProvider[] = [bioclip, plantId, plantNet, mock];

  const gateway = new IdentificationGateway(providers, repos.taxa);

  // --- 서비스/엔진 ---
  const observations = new ObservationService(repos.observations);
  const collection = new CollectionEngine(repos.collection, repos.taxa);
  const quests = new QuestEngine(repos.quests, repos.taxa);
  const rewards = new RewardEngine(
    SEED_BADGES,
    repos.badges,
    repos.users,
    repos.collection,
    repos.observations,
    repos.quests,
    repos.taxa,
  );
  const authorizer = new Authorizer(repos.users);
  const accounts = new AccountService(repos.users, authorizer);

  const dataRights = new DataRightsService({
    authorizer,
    users: repos.users,
    observations: repos.observations,
    collection: repos.collection,
    quests: repos.quests,
    badges: repos.badges,
    credentials: repos.credentials,
    consent: repos.consent,
    creatures: repos.creatures,
    garden: repos.garden,
  });

  const flow = new ObservationFlow({
    gateway,
    observations,
    collection,
    quests,
    rewards,
    authorizer,
    geocoder: new StubGridGeocoder(),
    creatures: repos.creatures,
    freeDailyLimit: config.identification.freeDailyLimit,
  });

  const mediaStore = new LocalDiskMediaStore(config.mediaStorage.localDir);
  const pendingSightings = new PendingSightingStore();
  const professor = await buildProfessorService({
    config,
    taxa: SEED_TAXA,
    contents: SEED_CONTENT,
    taxonRepo: repos.taxa,
    collectionRepo: repos.collection,
  });

  return {
    config,
    repos,
    dbPool,
    mock,
    gateway,
    authorizer,
    accounts,
    content,
    professor,
    collection,
    quests,
    rewards,
    dataRights,
    flow,
    mediaStore,
    pendingSightings,
  };
}
