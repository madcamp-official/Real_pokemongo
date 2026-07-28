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
  AudioSightingId,
} from "../domain/types.js";
import type { Quest, QuestProgress } from "../quest/questTypes.js";
import type { EarnedBadge } from "../rewards/rewardTypes.js";
import type { GardenLayout } from "../garden/gardenTypes.js";
import type { AudioSighting, AudioConfirmResult } from "../audio/audioTypes.js";
import type { AudioIdentificationResult } from "../audio/identification/audioIdentificationTypes.js";
import type { SpeciesSoundReference } from "../audio/reference/referenceTypes.js";

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

/**
 * 소리 기능 3단계: 업로드~변환 완료 세션(audio_sighting). PendingSightingStore와 달리
 * 정식 Repository 포트로 formalize한 이유는 core/audio/audioTypes.ts 상단 주석 참고
 * (DB 영속 + 24시간 TTL이 요구사항이라 사진의 인메모리 세션 패턴을 재사용할 수 없음).
 */
export interface AudioSightingRepository {
  create(sighting: AudioSighting): Promise<void>;
  /** 소유권 확인은 호출부 책임(Authorization.ts 원칙과 동일 — 존재 여부를 누설하지 않기
   * 위해 "없음"과 "남의 것"을 라우트 레벨에서 같은 404로 합친다). */
  get(id: AudioSightingId): Promise<AudioSighting | null>;
  /** 업로드 재시도 멱등성 판정용 — (userId, clientRecordingId) 유일 제약과 짝을 이룬다. */
  findByClientRecordingId(
    userId: UserId,
    clientRecordingId: string,
  ): Promise<AudioSighting | null>;
  /** 삭제권 이행(§5.6). */
  deleteByUser(userId: UserId): Promise<number>;
  /** 삭제권 이행(§5.6) — DataRightsService가 행을 지우기 전에 storagePath를 모아 실제
   * 오디오 파일까지 파기하기 위해 필요(사진과 달리 오디오는 지울 실제 스토리지가 이미 있음). */
  listByUser(userId: UserId): Promise<AudioSighting[]>;
  /** 5단계 TTL 스윕용 — expires_at이 now 이하인 세션들(AudioSessionCleanupService.ts).
   * limit은 한 스윕에서 한 번에 처리할 상한(운영 안전장치, 기본은 호출부가 정함). */
  findExpired(now: Date, limit: number): Promise<AudioSighting[]>;
  /** TTL 스윕이 파일 정리까지 끝난 뒤 행을 지울 때 씀. */
  deleteById(id: AudioSightingId): Promise<void>;
  /**
   * 7단계: 확정을 원자적으로 "클레임"한다(compare-and-swap, `confirmation_id IS NULL`일 때만
   * 성공). true면 이 호출이 클레임에 성공했다는 뜻 — 호출부가 이어서 관찰을 기록하고
   * finalizeConfirmation()으로 마무리해야 한다. false면 이미 누군가(같거나 다른
   * confirmation_id) 클레임을 가져갔다는 뜻 — 호출부는 다시 get()해서 sighting.confirmationId를
   * 요청 값과 비교해 재생(200)/충돌(409)을 판단한다. 동시에 도착한 서로 다른 확정 요청 중
   * 정확히 하나만 관찰을 만드는 것을 보장하는 유일한 지점(ACCEPTANCE.md 시나리오 7).
   */
  claimConfirmation(id: AudioSightingId, confirmationId: string): Promise<boolean>;
  /** claimConfirmation()으로 클레임을 따낸 뒤, 실제로 관찰을 기록하고 나서 결과를 확정
   * 저장한다. status를 'confirmed'로 바꿔 이후 /audio/identify(재동정)를 막는다. */
  finalizeConfirmation(
    id: AudioSightingId,
    params: { observationId: ObservationId; result: AudioConfirmResult },
  ): Promise<void>;
}

/**
 * 6단계: `/audio/identify` 결과 스냅샷(5단계가 스키마만 만들어둔 audio_identification_result
 * 실제 배선). PK가 audioSightingId 하나뿐이라 재동정은 upsert(덮어쓰기)다.
 */
export interface AudioIdentificationResultRepository {
  upsert(result: AudioIdentificationResult): Promise<void>;
  get(audioSightingId: AudioSightingId): Promise<AudioIdentificationResult | null>;
}

/**
 * 8단계: 종별 라이선스 참조 음원(species_sound_reference, 5단계가 스키마만 만들어둠).
 * 사람 검수(quality_status pending→approved/rejected)가 실제로 끝나기 전까진
 * listApproved()가 항상 빈 배열을 돌려준다 — 그게 정직한 현재 상태다(research/
 * audio-reference-pool/README.md 참고).
 */
export interface SpeciesSoundReferenceRepository {
  /** 유사도 계산에 실제로 쓸 수 있는(quality_status='approved') 참조 클립만. */
  listApproved(taxonId: TaxonId): Promise<SpeciesSoundReference[]>;
  get(id: string): Promise<SpeciesSoundReference | null>;
  /** 적재 스크립트(ingest_approved_clips.ts) 전용 — 같은 id로 다시 부르면 덮어쓴다(재적재
   * 멱등성, 사람이 clips.csv를 고치고 다시 돌릴 수 있어야 하므로). */
  upsertMany(refs: SpeciesSoundReference[]): Promise<void>;
  /** 9단계: GET /audio/health가 "참조 임베딩이 준비됐는가"를 판단하는 데 쓴다. 종별로
   * 순회하지 않고 전체 승인+임베딩완료 건수를 한 번에 세는 이유는 health 체크가 자주(운영
   * 모니터링) 호출될 수 있어 18종을 매번 순회하는 건 낭비이기 때문. */
  countApprovedWithEmbedding(): Promise<number>;
}
