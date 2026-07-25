/**
 * 조립 루트(Composition Root).
 *
 * 모든 의존성을 여기 한 곳에서 조립한다. 프로바이더/저장소를 바꾸는 일은 이 파일만
 * 수정하면 된다(명세서 §9의 "교체가 코드 1곳 변경" 원칙).
 *
 * - 동정 API 키가 있으면 실제 프로바이더를, 없으면 MockProvider 를 우선순위 뒤에 둔다.
 * - 저장소는 지금 in-memory. 프로덕션은 DB 어댑터로 교체(TODO: DATABASE_URL).
 */
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
} from "./core/repositories/memory/InMemoryRepositories.js";
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
import {
  SEED_TAXA,
  SEED_QUESTS,
  SEED_BADGES,
  SEED_CONTENT,
} from "./seed/seedData.js";

export interface App {
  config: AppConfig;
  repos: {
    users: InMemoryUserRepo;
    taxa: InMemoryTaxonRepo;
    observations: InMemoryObservationRepo;
    collection: InMemoryCollectionRepo;
    quests: InMemoryQuestRepo;
    badges: InMemoryBadgeRepo;
    credentials: InMemoryCredentialRepo;
    consent: InMemoryConsentRepo;
    creatures: InMemoryCreatureRepo;
  };
  mock: MockProvider; // 데모에서 시나리오 주입용
  gateway: IdentificationGateway;
  authorizer: Authorizer;
  accounts: AccountService;
  content: ContentCardService;
  collection: CollectionEngine;
  quests: QuestEngine;
  rewards: RewardEngine;
  dataRights: DataRightsService;
  flow: ObservationFlow;
  /** C단계: HTTP 계층 전용 조각(사진 로컬 저장, 업로드~동정확정 임시 상태). */
  mediaStore: LocalDiskMediaStore;
  pendingSightings: PendingSightingStore;
}

export async function buildApp(config: AppConfig = loadConfig()): Promise<App> {
  // --- 저장소 ---
  const repos = {
    users: new InMemoryUserRepo(),
    taxa: new InMemoryTaxonRepo(),
    observations: new InMemoryObservationRepo(),
    collection: new InMemoryCollectionRepo(),
    quests: new InMemoryQuestRepo(),
    badges: new InMemoryBadgeRepo(),
    credentials: new InMemoryCredentialRepo(),
    consent: new InMemoryConsentRepo(),
    creatures: new InMemoryCreatureRepo(),
  };

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

  return {
    config,
    repos,
    mock,
    gateway,
    authorizer,
    accounts,
    content,
    collection,
    quests,
    rewards,
    dataRights,
    flow,
    mediaStore,
    pendingSightings,
  };
}
