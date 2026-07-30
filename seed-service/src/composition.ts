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
  InMemoryAudioSightingRepo,
  InMemoryAudioIdentificationResultRepo,
  InMemorySpeciesSoundReferenceRepo,
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
  PgAudioSightingRepo,
  PgAudioIdentificationResultRepo,
  PgSpeciesSoundReferenceRepo,
  upsertBadgeDefinitions,
  upsertGardenAssetCatalog,
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
  AudioSightingRepository,
  AudioIdentificationResultRepository,
  SpeciesSoundReferenceRepository,
} from "./core/repositories/ports.js";
import { AudioConverter } from "./core/audio/AudioConverter.js";
import { AudioTempStore } from "./core/audio/AudioTempStore.js";
import { AudioUploadService } from "./core/audio/AudioUploadService.js";
import { AudioSessionCleanupService } from "./core/audio/AudioSessionCleanupService.js";
import { BirdNetAudioProvider } from "./core/audio/identification/BirdNetAudioProvider.js";
import { AudioIdentificationGateway } from "./core/audio/identification/AudioIdentificationGateway.js";
import { ReferenceMediaStore } from "./core/audio/reference/ReferenceMediaStore.js";
import { ReferenceEmbeddingStore } from "./core/audio/reference/ReferenceEmbeddingStore.js";
import { BirdNetEmbeddingProvider } from "./core/audio/similarity/BirdNetEmbeddingProvider.js";
import { SimilarityGateway } from "./core/audio/similarity/SimilarityGateway.js";
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
import { SEED_GARDEN_ASSETS } from "./seed/gardenAssetCatalog.js";

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
    audioSightings: AudioSightingRepository;
    audioIdentificationResults: AudioIdentificationResultRepository;
    speciesSoundReferences: SpeciesSoundReferenceRepository;
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
  /** 소리 기능 3단계: 업로드~변환 오케스트레이션. */
  audioUpload: AudioUploadService;
  /** mediaStore(사진)와 대칭 — 테스트/삭제권 검증이 실제 파일 존재 여부를 직접 확인할 때 씀. */
  audioTempStore: AudioTempStore;
  /** 5단계: TTL 스윕. buildApp()은 만들기만 하고 start()는 안 부른다 — serve.ts 참고. */
  audioCleanup: AudioSessionCleanupService;
  /** 6단계: 소리 동정 API. */
  audioIdentification: AudioIdentificationGateway;
  /** 8단계: 참조 음원(영구) 저장소 — 적재 스크립트/GET /species/:id/sounds 재생 라우트가 씀. */
  referenceMediaStore: ReferenceMediaStore;
  /** 8단계: 참조 클립 사전계산 임베딩 저장소. */
  referenceEmbeddingStore: ReferenceEmbeddingStore;
  /** 8단계: 유사도 채점(POST /audio/similarity/score). */
  similarity: SimilarityGateway;
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
    audioSightings: new InMemoryAudioSightingRepo(),
    audioIdentificationResults: new InMemoryAudioIdentificationResultRepo(),
    speciesSoundReferences: new InMemorySpeciesSoundReferenceRepo(),
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
        audioSightings: new PgAudioSightingRepo(dbPool),
        audioIdentificationResults: new PgAudioIdentificationResultRepo(dbPool),
        speciesSoundReferences: new PgSpeciesSoundReferenceRepo(dbPool),
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
  if (dbPool) await upsertGardenAssetCatalog(dbPool, SEED_GARDEN_ASSETS);
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

  // audioUpload보다 먼저 만든다 — DataRightsService가 삭제권 이행에 바로 필요로 하기 때문
  // (5단계: 오디오 세션도 계정 삭제 시 파기 대상, docs/audio/DATA_CONTRACT.md "Privacy and
  // deletion" 참고).
  const audioTempStore = new AudioTempStore(config.audio.tempDir);

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
    audioSightings: repos.audioSightings,
    audioTempStore,
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

  // --- 소리 기능 3단계 ---
  const audioConverter = new AudioConverter({
    tempDir: config.audio.tempDir,
    maxDurationSeconds: config.audio.maxDurationSeconds,
    timeoutMs: config.audio.conversionTimeoutMs,
  });
  const audioUpload = new AudioUploadService(audioConverter, audioTempStore, repos.audioSightings, {
    ttlHours: config.audio.ttlHours,
  });
  // 5단계: TTL 스윕. 여기서는 만들기만 하고 시작하지 않는다 — start()는 serve.ts(진짜 프로세스
  // 부팅)만 호출한다(AudioSessionCleanupService.ts 상단 주석 — buildApp()을 여러 번 부르는
  // 테스트에서 백그라운드 타이머가 계속 쌓이는 걸 막기 위함).
  const audioCleanup = new AudioSessionCleanupService(repos.audioSightings, audioTempStore);

  // --- 소리 기능 6단계 ---
  // bioclip과 동일한 온/오프 관례 — endpoint가 비어있으면(기본) isConfigured()=false라
  // AudioIdentificationGateway.identify()가 곧바로 throw한다(라우트가 503으로 매핑).
  const birdNetProvider = new BirdNetAudioProvider(config.audio.model);
  const audioIdentification = new AudioIdentificationGateway(birdNetProvider, repos.taxa);

  // --- 소리 기능 8단계 ---
  // config.audio.model을 그대로 재사용한다 — 같은 CAMP-3 모델 서비스, 같은 엔드포인트를
  // 부르는 별도 프로바이더일 뿐(BirdNetEmbeddingProvider.ts 상단 주석 참고).
  const referenceMediaStore = new ReferenceMediaStore(`${config.audio.referenceDir}/media`);
  const referenceEmbeddingStore = new ReferenceEmbeddingStore(`${config.audio.referenceDir}/embeddings`);
  const embeddingProvider = new BirdNetEmbeddingProvider(config.audio.model);
  const similarity = new SimilarityGateway(
    embeddingProvider,
    repos.speciesSoundReferences,
    referenceEmbeddingStore,
  );

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
    audioUpload,
    audioTempStore,
    audioCleanup,
    audioIdentification,
    referenceMediaStore,
    referenceEmbeddingStore,
    similarity,
  };
}
