-- =============================================================================
-- 리빙도감(가칭) 백엔드 DB 스키마 — PostgreSQL
-- -----------------------------------------------------------------------------
-- 대상: PostgreSQL 14+ (config/index.ts, .env.example의 DATABASE_URL=postgres://... 기준)
--
-- 역할이 바뀌었다(2026-07-28, db/migrations/0001_baseline.sql 도입): 이 파일은 이제
-- "완전히 새 DB를 처음부터 세팅할 때"의 스냅샷 참고 문서다. src/db/migrate.ts는 더 이상
-- 이 파일을 실행하지 않는다 — 이미 실데이터가 있는 공유 DB에 재실행하면 CREATE TABLE 등이
-- 그대로 실패한다(IF NOT EXISTS 없음). 이후 모든 스키마 변경은 db/migrations/의 번호 붙은
-- 파일로만 한다. 신규 개발 환경을 처음부터 만들 때만 이 파일 전체를 수동으로 한 번 실행하고,
-- 그 직후 바로 db:migrate를 돌려 0001_baseline이 추적을 시작하게 한다.
--
-- 설계 원칙(도메인 코드에서 그대로 도출, 추측 아님):
--   P1. 위치 데이터 정책(D단계에서 개정됨) — region_code(시·군·구 일반화 값)는 여전히
--       보호자 동의(location_storage_enabled) 게이트를 따른다. 단, **정밀 좌표
--       (observation.precise_lat/precise_lng)는 D단계 제품 결정으로 동의 여부와 무관하게
--       항상 저장한다.** "정밀 좌표를 아예 저장하지 않는다"는 원래 원칙은 더 이상 사실이
--       아니다(domain/types.ts의 PreciseCoordinate, ObservationFlow.recordIdentification
--       참고). 이 결정을 되돌리려면 그 파일의 한 줄만 동의 게이트로 감싸면 된다 — 그때
--       이 스키마도 precise_lat/lng를 NULL 허용은 유지한 채 쓰기 조건만 바뀐다.
--   P2. 안전 우선 — 위험 생물 처리(F4)의 단일 진실 원천은 taxon_risk_tag 이다.
--       "식용 가부(edibility)" 개념은 의도적으로 존재하지 않는다(독버섯 오판 리스크 회피).
--   P3. 삭제권(§5.6) — 사용자 데이터 테이블은 전부 user_id FK + ON DELETE CASCADE 를 갖는다.
--       DataRightsService 는 파기 리포트를 위해 여전히 자식→프로필 순서로 카운트하며 지우되,
--       CASCADE 가 누락 방지 안전망이 된다(둘 다 한 트랜잭션 안에서).
--   P4. 정직한 범위 구분 — [핵심]은 현재 서버가 실DB로 돌기 위해 지금 필요한 전부(D단계에서
--       개체(creature) 자동생성·보상 claim이 여기 편입됨). [선행-계약]은 프론트가 계약했으나
--       백엔드 도메인 로직이 아직 없는 기능(F16 홈가든 배치, F9 Bond 상호작용 전체).
--       후자는 "아직 어떤 코드도 쓰지 않는 테이블"임을 명시한다.
--
-- ID 규약(ids.ts에서 도출):
--   - 사람이 읽는 슬러그 PK(TEXT): taxon, quest, badge_definition, species_content
--     (예: 'taxon-dandelion', 'quest-spring-yellow-flowers', 'badge-first-find')
--   - 시스템 생성 PK(UUID, randomUUID): app_user, observation, creature
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0) 열거형(통제 어휘) — domain/types.ts, questTypes.ts의 유니온 타입과 1:1 대응
-- =============================================================================
CREATE TYPE taxon_group      AS ENUM ('plant','insect','fungus','bird','amphibian','reptile','mammal','other');
CREATE TYPE taxon_rank       AS ENUM ('species','genus','family','order','class','phylum','kingdom');
CREATE TYPE season           AS ENUM ('spring','summer','autumn','winter');
CREATE TYPE habitat          AS ENUM ('neighborhood','park','mountain','waterside','garden','field');
CREATE TYPE rarity           AS ENUM ('common','uncommon','rare');
CREATE TYPE active_time      AS ENUM ('day','both','night'); -- F6 종 카드 활동시간대
CREATE TYPE risk_tag         AS ENUM ('toxic_if_eaten','sting_or_bite','contact_dermatitis','allergen','protected_species');
CREATE TYPE subscription_plan AS ENUM ('free','family');
CREATE TYPE quest_type       AS ENUM ('seasonal','theme','habitat','daily','family','story');
-- 배지 표시 분류(F8). 계산값이 아니라 저작 콘텐츠 — rewardTypes.ts의 BadgeTheme과 1:1.
CREATE TYPE badge_theme      AS ENUM ('수집','탐험','우정','연속출석');
-- 홈가든 타일(F16). 프론트는 한글 라벨(잔디/물웅덩이/흙/돌/꽃밭)을 쓰지만 DB는 정규 영문 코드로
-- 저장하고 어댑터에서 매핑한다: grass=잔디, water_pool=물웅덩이, soil=흙, rock=돌, flower_bed=꽃밭.
CREATE TYPE tile_type        AS ENUM ('grass','water_pool','soil','rock','flower_bed');


-- #############################################################################
-- [핵심 / CORE] — 현재 서버 로직이 실제로 읽고 쓰는 전부. 실DB 전환에 즉시 필요.
-- #############################################################################

-- =============================================================================
-- 1) 종 마스터 데이터 (Taxon) — 사용자 데이터 아님(공유 참조), CASCADE 대상 아님
-- =============================================================================
-- 슬러그 PK. group/rank/rarity 는 단일값이라 enum 컬럼, 다중값 태그(season/habitat/risk/alias)는
-- 정규화된 자식 테이블로 분리(배열 컬럼보다 참조 무결성·조인 질의에 견고).
CREATE TABLE taxon (
    id          TEXT        PRIMARY KEY,               -- 예: 'taxon-dandelion'
    sci_name    TEXT        NOT NULL,                  -- 학명
    kor_name    TEXT        NOT NULL,                  -- 국명
    rank        taxon_rank  NOT NULL,
    parent_id   TEXT        REFERENCES taxon(id) ON DELETE SET NULL,  -- 상위 분류군(폴백)
    "group"     taxon_group NOT NULL,
    rarity      rarity      NOT NULL,
    media_ref   TEXT,                                  -- 대표 이미지(도감 카드용), 없으면 NULL
    -- F6 종 카드 표시용(선택). 자유 텍스트인 이유: 곤충은 mm, 나무는 m 등 종마다 단위가 달라
    -- 단일 숫자 컬럼으로는 정직하게 표현 불가 — mappers.ts "지어내지 않는다" 원칙과 동일.
    size_description TEXT,
    active_time active_time,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- findBySciName 은 대소문자 무시(InMemoryTaxonRepo가 toLowerCase 로 조회). 대소문자 무시 유일성 보장.
CREATE UNIQUE INDEX taxon_sci_name_lower_key ON taxon (lower(sci_name));
CREATE INDEX taxon_group_idx ON taxon ("group");

-- 다중값 태그(집합) — 각 (taxon_id, value) 유일. list({season}/{habitat}) 질의에 조인.
CREATE TABLE taxon_season (
    taxon_id TEXT   NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
    season   season NOT NULL,
    PRIMARY KEY (taxon_id, season)
);
CREATE TABLE taxon_habitat (
    taxon_id TEXT    NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
    habitat  habitat NOT NULL,
    PRIMARY KEY (taxon_id, habitat)
);
CREATE TABLE taxon_risk_tag (
    taxon_id TEXT     NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
    risk_tag risk_tag NOT NULL,
    PRIMARY KEY (taxon_id, risk_tag)
);
-- 별명/속명(아이용) — 퀘스트 criteria.tagAny 매칭에 쓰인다(QuestEngine.matches).
CREATE TABLE taxon_alias (
    taxon_id TEXT NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
    alias    TEXT NOT NULL,
    PRIMARY KEY (taxon_id, alias)
);

-- =============================================================================
-- 2) 종 콘텐츠 (SpeciesContent, F6) — 사용자 데이터 아님(공유 참조)
-- =============================================================================
CREATE TABLE species_content (
    taxon_id       TEXT PRIMARY KEY REFERENCES taxon(id) ON DELETE CASCADE,
    fun_fact       TEXT NOT NULL DEFAULT '',
    observe_points TEXT[] NOT NULL DEFAULT '{}',
    -- 알려진 간극: mappers.ts 주석대로 similar_species 는 지금 '이름 문자열'뿐 실제 taxon FK 가
    -- 없다. 향후 taxon 참조로 승격 필요(임시로 텍스트 배열 유지 — 지어내지 않고 있는 만큼만).
    similar_species TEXT[] NOT NULL DEFAULT '{}',
    narration_ref  TEXT,                               -- TTS/성우 음성 참조, 없으면 NULL
    quiz           JSONB,                              -- [{q, options[], answerIndex}] 구조, 없으면 NULL
    curriculum_tags TEXT[] NOT NULL DEFAULT '{}'
);

-- =============================================================================
-- 3) 계정 (User) + 인증 자격증명 + 동의 이력 (F1, F18)
-- =============================================================================
CREATE TABLE app_user (
    id                        UUID PRIMARY KEY,        -- randomUUID()
    plan                      subscription_plan NOT NULL DEFAULT 'free',
    -- 프라이버시 기본값 OFF(F12). 이 값이 false면 관찰 시 region 자체가 저장되지 않는다.
    location_storage_enabled  BOOLEAN NOT NULL DEFAULT false,
    nickname                  TEXT    NOT NULL,        -- 실명 아님
    avatar                    TEXT    NOT NULL,
    level                     INTEGER NOT NULL DEFAULT 1  CHECK (level >= 1),
    xp                        INTEGER NOT NULL DEFAULT 0  CHECK (xp >= 0),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 참고: XPProfile.xp_to_next(프론트)는 레벨 곡선(DEFAULT_LEVEL_CURVE, 설정)에서 파생되는
-- 계산값이라 컬럼으로 저장하지 않는다(중복 상태 = 불일치 위험 제거).

-- 자격증명은 User 와 의도적으로 분리(domain/types.ts 주석). 비밀번호 해시가 도메인 로직에
-- 노출되는 표면을 줄인다. 1 계정 = 1 자격증명.
CREATE TABLE credential (
    user_id       UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL                        -- scrypt "salt:hash" (node:crypto)
);
-- 이메일 중복 가입 방지(대소문자 무시 — auth.routes.ts가 findByEmail로 lower 비교).
CREATE UNIQUE INDEX credential_email_lower_key ON credential (lower(email));

-- 동의 이력(F1: "동의 이력…타임스탬프·버전 관리"). 현재 InMemoryConsentRepo는 1행 덮어쓰기지만,
-- 명세가 '이력'을 요구하므로 append-only 로그로 설계한다(getByUser = 최신 1건). 이는 현재
-- 인메모리 구현의 단순화를 DB에서 바로잡는 지점.
CREATE TABLE consent_record (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID    NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    privacy         BOOLEAN NOT NULL,
    location        BOOLEAN NOT NULL,
    photo           BOOLEAN NOT NULL,
    consent_version TEXT    NOT NULL,
    agreed_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX consent_record_user_idx ON consent_record (user_id, agreed_at DESC);

-- =============================================================================
-- 4) 관찰 (Observation, F9) — 사용자 데이터
-- =============================================================================
-- region_code(일반화 값)는 여전히 동의 게이트를 따른다. precise_lat/lng(D단계)는 동의와
-- 무관하게 항상 저장된다(단, 클라이언트가 애초에 좌표를 안 줬으면 둘 다 NULL — 있는 것만
-- 저장, 지어내지 않음). 상단 P1 주석 참고.
CREATE TABLE observation (
    id           UUID PRIMARY KEY,                     -- randomUUID()
    user_id      UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    -- 동정 실패/상위분류만 된 경우 taxon_id=NULL 허용. 마스터 종을 함부로 못 지우게 RESTRICT.
    taxon_id     TEXT REFERENCES taxon(id) ON DELETE RESTRICT,
    taxon_rank   taxon_rank,                           -- 어느 계급까지 확정됐는지(species 아닐 수 있음)
    observed_at  TIMESTAMPTZ NOT NULL,                 -- domain의 timestamp(ISO)
    region_code  TEXT,                                 -- 위치 저장 OFF 또는 미제공 시 NULL(동의 게이트)
    region_label TEXT,                                 -- 표시용(예: "서울 강남구"), 없으면 NULL
    precise_lat  DOUBLE PRECISION,                      -- D단계: 동의 무관 저장. 미제공 시 NULL
    precise_lng  DOUBLE PRECISION,                      -- D단계: 동의 무관 저장. 미제공 시 NULL
    confidence   REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    source       TEXT NOT NULL,                        -- 어느 프로바이더/모델 결과인지(출처 기록)
    note         TEXT,
    -- taxon_id 가 NULL이면 rank 도 NULL이어야 논리적으로 일관(둘 다 있거나 둘 다 없음은 아님:
    -- rank 없이 taxon만 있는 건 허용, 그 역은 금지).
    CONSTRAINT observation_rank_requires_taxon
        CHECK (taxon_id IS NOT NULL OR taxon_rank IS NULL),
    -- 정밀 좌표는 위도/경도가 함께 있거나 함께 없어야 한다(반쪽 좌표 금지).
    CONSTRAINT observation_precise_coord_pair
        CHECK ((precise_lat IS NULL) = (precise_lng IS NULL))
);
-- listByUser / listByUserSince(일일 한도 계산)용.
CREATE INDEX observation_user_time_idx ON observation (user_id, observed_at DESC);

-- 관찰 미디어(MediaRef[]) — 정화본 참조. 파기 리포트(mediaRefsToPurge) 수집에 사용.
CREATE TABLE observation_media (
    observation_id UUID    NOT NULL REFERENCES observation(id) ON DELETE CASCADE,
    ordinal        INTEGER NOT NULL,                   -- 프레임 순서(버스트 대응)
    media_ref      TEXT    NOT NULL,                   -- 예: 'local://<uuid>.bin'
    PRIMARY KEY (observation_id, ordinal)
);

-- =============================================================================
-- 5) 도감 진행 (CollectionEntry, F5) — 사용자 데이터
-- =============================================================================
CREATE TABLE collection_entry (
    user_id             UUID    NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    taxon_id            TEXT    NOT NULL REFERENCES taxon(id) ON DELETE RESTRICT,
    unlocked            BOOLEAN NOT NULL DEFAULT false,
    first_observed_at   TIMESTAMPTZ,
    first_observation_id UUID   REFERENCES observation(id) ON DELETE SET NULL,
    times_observed      INTEGER NOT NULL DEFAULT 0 CHECK (times_observed >= 0),
    PRIMARY KEY (user_id, taxon_id)
);

-- =============================================================================
-- 6) 퀘스트 정의 + 진행 (F7) — 정의는 공유 참조, 진행은 사용자 데이터
-- =============================================================================
CREATE TABLE quest (
    id             TEXT PRIMARY KEY,                   -- 예: 'quest-spring-yellow-flowers'
    type           quest_type NOT NULL,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL,
    -- criteria: 관찰에 대한 술어. 알려진 스칼라 조건은 타입 컬럼으로(질의·검증 가능),
    -- 자유 태그(tagAny)만 배열로.
    distinct_taxa  INTEGER NOT NULL CHECK (distinct_taxa >= 1),
    crit_season    season,
    crit_habitat   habitat,
    crit_group     taxon_group,
    crit_rarity    rarity,
    crit_tag_any   TEXT[] NOT NULL DEFAULT '{}',
    -- reward. reward_badge_id 의 FK 는 badge_definition 생성 이후 ALTER 로 추가한다
    -- (Postgres는 순방향 참조 불가 — 아래 7)절 뒤에서 제약 추가).
    reward_xp        INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
    reward_badge_id  TEXT,
    reward_cosmetic  TEXT,
    active_from    TIMESTAMPTZ NOT NULL,
    active_to      TIMESTAMPTZ,
    chapter        INTEGER,                            -- 스토리 모드 순서(P1)
    curriculum_tags TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE quest_progress (
    user_id      UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    quest_id     TEXT NOT NULL REFERENCES quest(id) ON DELETE CASCADE,
    completed    BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    -- D단계 확정: 퀘스트 완료(completed_at)와 보상 수령(claimed_at)은 분리된 별개 시점이다.
    -- completed=true가 돼도 자동으로 XP가 지급되지 않고, 사용자가 명시적으로
    -- POST /quests/:id/claim을 호출해야만 claimed_at이 채워지며 그때 XP가 들어온다
    -- (RewardEngine.claimQuest). NULL이면 아직 안 받은 것.
    claimed_at   TIMESTAMPTZ,
    PRIMARY KEY (user_id, quest_id),
    CONSTRAINT quest_progress_completed_consistency
        CHECK (completed = (completed_at IS NOT NULL)),
    CONSTRAINT quest_progress_claim_requires_complete
        CHECK (claimed_at IS NULL OR completed_at IS NOT NULL)
);

-- 진행 중 매칭된 '서로 다른 종' 집합. 배열 대신 정규화 — (user,quest,taxon) 유일성이
-- 중복 카운트를 스키마 수준에서 막는다(QuestEngine의 dedup을 DB가 보증).
CREATE TABLE quest_progress_taxon (
    user_id  UUID NOT NULL,
    quest_id TEXT NOT NULL,
    taxon_id TEXT NOT NULL REFERENCES taxon(id) ON DELETE CASCADE,
    matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, quest_id, taxon_id),
    FOREIGN KEY (user_id, quest_id) REFERENCES quest_progress(user_id, quest_id) ON DELETE CASCADE
);

-- =============================================================================
-- 7) 배지 정의 + 획득 (F8) — 정의는 공유 참조, 획득은 사용자 데이터
-- =============================================================================
CREATE TABLE badge_definition (
    id          TEXT PRIMARY KEY,                      -- 예: 'badge-first-find'
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    xp          INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    -- rule: 결정론적 판정 규칙(BadgeRule 유니온). 종류별 파라미터가 달라 JSONB로 저장
    -- (authored config, 확률형 없음). 예: {"kind":"distinctTaxaInGroup","group":"insect","count":3}
    rule        JSONB NOT NULL,
    -- theme/icon: 프론트 표시용 저작 콘텐츠(rewardTypes.ts BadgeDefinition 참고, D단계 추가).
    theme       badge_theme NOT NULL,
    icon        TEXT NOT NULL
);

CREATE TABLE earned_badge (
    user_id   UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    badge_id  TEXT NOT NULL REFERENCES badge_definition(id) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL,       -- "해금"(규칙 충족 또는 퀘스트 보상) 시각
    -- D단계 확정: earned_badge 행 존재=해금(unlocked), claimed_at 존재=수령(claimed).
    -- 해금돼도 자동으로 XP가 안 들어온다 — POST /badges/claim으로 별도 수령해야 한다
    -- (RewardEngine.claimBadge). 퀘스트가 배지를 보상으로 줄 때도 "해금"만 하고 claim은
    -- 여전히 별도다(RewardEngine.claimQuest 참고).
    claimed_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, badge_id),
    CONSTRAINT earned_badge_claim_after_earn
        CHECK (claimed_at IS NULL OR claimed_at >= earned_at)
);

-- quest.reward_badge_id → badge_definition FK (양쪽 테이블이 다 생성된 지금 추가).
ALTER TABLE quest
    ADD CONSTRAINT quest_reward_badge_fk
    FOREIGN KEY (reward_badge_id) REFERENCES badge_definition(id) ON DELETE SET NULL;


-- =============================================================================
-- 8) 개체(Creature) & 친밀도(Bond) (F9) — 개체 단위 동반자 레이어
-- =============================================================================
-- D단계 확정: 도메인 관계는 observation(촬영 이벤트, 불변 로그) < collection_entry(종 단위
-- 해금) 위에 얹히는 '개체 단위 동반자'. mappers.ts는 이제 합성이 아니라 이 테이블의 실제
-- 레코드를 그대로 반환한다(collectionEntryToDexEntry, D단계).
--
-- 제품 결정 확정(예전 Q1/Q2, ObservationFlow.recordIdentification 참고):
--   - 확정 관찰 1회마다 홈가든에 놓을 수 있는 독립 개체 1마리가 생성된다.
--   - 같은 종을 여러 번 관찰하면 그 수만큼 서로 다른 creature.id를 보유할 수 있다.
-- ★ 아직 미해결(범위 밖, F9 Bond 상호작용 전체 구현 시 확정): bond_max(현재 프론트 상수 5)를
--   개체별로 달리할지 — 지금은 앱 상수로 두고 컬럼화하지 않음(상수 중복 저장 회피).
CREATE TABLE creature (
    id                   UUID PRIMARY KEY,             -- randomUUID()
    user_id              UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    taxon_id             TEXT NOT NULL REFERENCES taxon(id) ON DELETE RESTRICT,
    nickname             TEXT,                          -- 아이가 붙인 이름, 없으면 NULL
    -- 이 개체가 유래한 관찰(선택적 추적). 관찰이 파기되면 링크만 끊고 개체는 유지.
    origin_observation_id UUID REFERENCES observation(id) ON DELETE SET NULL,
    bond                 INTEGER NOT NULL DEFAULT 1 CHECK (bond >= 0),
    last_interaction_at  TIMESTAMPTZ,                   -- 재회(reunion) 판정 기준(F9, 범위 밖)
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()   -- days_together 파생 기준
);
CREATE INDEX creature_user_idx ON creature (user_id);
CREATE INDEX creature_user_taxon_idx ON creature (user_id, taxon_id);
CREATE UNIQUE INDEX creature_origin_observation_unique_idx
    ON creature (origin_observation_id)
    WHERE origin_observation_id IS NOT NULL;
-- days_together, is_reunion, status_message 는 전부 파생값(저장 안 함) — core/garden/bondRules.ts가
-- 요청마다 계산한다: days_together = now - created_at, is_reunion = now - (last_interaction_at ??
-- created_at) > 임계(3일), status_message = 규칙 기반(재회/최대 유대감/그 외 소수 문구 중 결정).


-- #############################################################################
-- F16 홈가든(타일 배치) + F9 유대감(Bond) — GardenRepository(core/garden/)가 사용한다.
-- bond_max=5, 재회(reunion) 임계=3일은 core/garden/bondRules.ts에 앱 상수로 고정
-- (제품 결정 — 이 스키마 자체에는 반영할 값 없음, creature.bond/last_interaction_at을
-- 그대로 읽고 씀).
-- #############################################################################

-- =============================================================================
-- 9) 홈가든 (F16) — 타일 배치 + 개체 배치
-- =============================================================================
-- 타일 맵: 사용자별 격자. 프론트 mock은 고정 6×6 기본맵이지만, 사용자 편집 가능성을 위해
-- 사용자별로 저장(편집 안 하면 기본맵을 시딩). 좌표는 격자 인덱스(정밀 위치 아님 — P1과 무관).
CREATE TABLE garden_tile (
    user_id  UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    "row"    INTEGER NOT NULL CHECK ("row" >= 0),
    col      INTEGER NOT NULL CHECK (col >= 0),
    type     tile_type NOT NULL,
    PRIMARY KEY (user_id, "row", col)
);

-- 개체 배치: 식물/나무는 슬롯, 동물/곤충/새는 PC 온실 바닥 자유 좌표를 사용한다.
CREATE TABLE creature_placement (
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    "row"       INTEGER,
    col         INTEGER,
    creature_id UUID NOT NULL UNIQUE REFERENCES creature(id) ON DELETE CASCADE,
    placement_mode TEXT NOT NULL DEFAULT 'slot'
                   CHECK (placement_mode IN ('slot', 'free')),
    world_x REAL,
    world_y REAL,
    world_z REAL,
    CHECK (
        (placement_mode = 'slot'
         AND "row" IS NOT NULL AND col IS NOT NULL
         AND world_x IS NULL AND world_y IS NULL AND world_z IS NULL)
        OR
        (placement_mode = 'free'
         AND "row" IS NULL AND col IS NULL
         AND world_x IS NOT NULL AND world_y IS NOT NULL AND world_z IS NOT NULL)
    ),
    FOREIGN KEY (user_id, "row", col) REFERENCES garden_tile(user_id, "row", col) ON DELETE CASCADE
);
CREATE UNIQUE INDEX creature_placement_slot_unique
    ON creature_placement (user_id, "row", col)
    WHERE placement_mode = 'slot';

-- Unity Resources의 모든 정원용 3D 자산을 서버 taxon과 연결하는 배포 카탈로그.
CREATE TABLE garden_asset_catalog (
    asset_key          TEXT PRIMARY KEY,
    taxon_id           TEXT REFERENCES taxon(id) ON DELETE SET NULL,
    display_name       TEXT NOT NULL,
    category           TEXT NOT NULL
                       CHECK (category IN ('tree','plant','insect','bird','animal')),
    resource_path      TEXT NOT NULL UNIQUE,
    behaviour_profile TEXT NOT NULL,
    display_scale      REAL NOT NULL CHECK (display_scale > 0),
    minimum_altitude   REAL NOT NULL DEFAULT 0,
    enabled            BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX garden_asset_catalog_taxon_idx
    ON garden_asset_catalog (taxon_id)
    WHERE taxon_id IS NOT NULL;
-- 타일-종 호환성(TileCompatibility, 그룹→배치가능 타일)은 정적 config로 확정(제품 결정) —
-- 사용자가 편집하는 대상이 아니라 seedData.ts의 TILE_COMPATIBILITY 상수. 테이블화하지 않음.

COMMIT;

-- =============================================================================
-- [지도(F11)에 대한 결정 — 의도적으로 테이블 없음]
-- -----------------------------------------------------------------------------
-- MapPin / ExploredRegions / WeeklyStats 는 저장 테이블을 두지 않고 observation으로부터
-- 파생(read-model)한다. 이유:
--   - MapPin의 (x,y) 0~1 좌표는 좌표를 별도로 또 저장하는 대신, region_code를 결정론적으로
--     해싱해 투영하거나(기존 계획), D단계 이후엔 precise_lat/lng가 이미 있으니 그걸 정규화해
--     그려도 된다 — 다만 지도 화면에 정밀 좌표를 그대로 노출하면 안 된다(여전히 뭉개서
--     보여줘야 함, "저장은 하되 그대로 내보내지 않는다"는 별개 문제로 구현 단계에서 다룰 것).
--   - WeeklyStats.places_discovered = 최근 7일 distinct region_code, new_species = 최근 7일 신규 taxon.
--   ~~예전 발견(P1 개정으로 해소됨)~~: WeeklyStats.distance_km 는 원래 "정밀 좌표를 아예 저장
--     안 해서 계산 불가"였는데, D단계에서 precise_lat/lng를 저장하기 시작하면서 이제는 연속된
--     관찰들 사이의 하버사인 거리로 실제 계산 가능해졌다. 다만 이 계산 로직 자체는 아직
--     구현 안 함(F11 지도 엔드포인트가 범위 밖이라) — 나중에 구현할 때, 좌표를 저장하는 것과
--     "그 좌표로 계산한 결과(거리)만 보여주고 좌표 자체는 API로 안 새어나가게" 하는 것은
--     별개 설계 포인트임을 유의할 것.
--
-- [사전 위험 스캔(F19)에 대한 결정 — 테이블 없음]
--   PreviewScan 은 무상태(stateless) 조회다(터치 좌표+저해상도 크롭 → 위험 여부 즉답). 영속 대상
--   아님. 어떤 테이블도 필요 없다.
--
-- [임시 업로드 상태(PendingSighting)에 대한 결정 — DB 아님]
--   PendingSightingStore 는 업로드~동정확정 사이의 세션성 상태다(PendingSightingStore.ts 주석대로
--   삭제권 대상도 아니고 프로세스 재시작으로 사라져도 무방). 영속 DB가 아니라 인메모리/캐시(예:
--   Redis, 다중 인스턴스로 확장 시)로 둔다. 이 스키마에 포함하지 않는다.
-- =============================================================================
