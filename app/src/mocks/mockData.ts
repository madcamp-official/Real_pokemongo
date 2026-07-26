import type {
  DexEntry,
  DexCompletion,
  SpeciesCard,
  IdentifyResponse,
  PreviewScanResponse,
  SignupResponse,
  RestoreBundleResponse,
  GardenLayout,
  GardenTile,
  TileCompatibility,
  TileType,
  CreatureStatus,
  InteractResponse,
  XPProfile,
  Badge,
  Quest,
  MapPin,
  ExploredRegionsResponse,
} from '@/types/api';
import type { GuestConvertResponse } from '@/api/auth';

/**
 * Phase 0 mock 데이터.
 * 각 Phase 진입 시 해당 기능의 mock 을 이 파일에서 확장한다.
 */

export const mockDex: DexEntry[] = [
  {
    species_id: 'sp_ladybug',
    name: '무당벌레',
    discovered: true,
    group: '곤충',
    creatures: [
      { id: 'cr_1', species_id: 'sp_ladybug', nickname: '점박이', discovered_at: '2026-07-20' },
    ],
  },
  {
    species_id: 'sp_stagbeetle',
    name: '사슴벌레',
    discovered: true,
    group: '곤충',
    creatures: [{ id: 'cr_2', species_id: 'sp_stagbeetle', discovered_at: '2026-07-21' }],
  },
  {
    species_id: 'sp_frog',
    name: '개구리',
    discovered: true,
    group: '양서류',
    creatures: [{ id: 'cr_3', species_id: 'sp_frog', discovered_at: '2026-07-21' }],
  },
  {
    species_id: 'sp_snail',
    name: '달팽이',
    discovered: true,
    group: '기타',
    creatures: [{ id: 'cr_4', species_id: 'sp_snail', discovered_at: '2026-07-22' }],
  },
  { species_id: 'sp_locked_1', name: '???', discovered: false, group: '기타', creatures: [] },
  {
    species_id: 'sp_ant',
    name: '개미',
    discovered: true,
    group: '곤충',
    creatures: [{ id: 'cr_5', species_id: 'sp_ant', discovered_at: '2026-07-23' }],
  },
  { species_id: 'sp_locked_2', name: '???', discovered: false, group: '곤충', creatures: [] },
  { species_id: 'sp_locked_3', name: '???', discovered: false, group: '양서류', creatures: [] },
  {
    species_id: 'sp_butterfly',
    name: '나비',
    discovered: true,
    group: '곤충',
    creatures: [{ id: 'cr_6', species_id: 'sp_butterfly', discovered_at: '2026-07-23' }],
  },
];

export const mockDexCompletion: DexCompletion = {
  total: 40,
  discovered: 15,
  percentage: 38,
};

const SPECIES_CARDS: Record<string, SpeciesCard> = {
  sp_ladybug: {
    species_id: 'sp_ladybug',
    name: '무당벌레',
    scientific_name: 'Coccinella septempunctata',
    group: '곤충',
    habitat: '풀숲·잎사귀',
    size: '6mm 내외',
    active_time: '낮',
    rarity: '흔해요',
    fun_fact: '하루에 진딧물을 50마리도 넘게 잡아먹는 농부의 든든한 친구예요!',
    similar_species: [
      { species_id: 'sp_sevenspot', name: '칠성무당벌레' },
      { species_id: 'sp_turtleladybug', name: '남생이무당벌레' },
    ],
    is_dangerous: false,
  },
  sp_stagbeetle: {
    species_id: 'sp_stagbeetle',
    name: '사슴벌레',
    scientific_name: 'Lucanus maculifemoratus',
    group: '곤충',
    habitat: '참나무 숲',
    size: '4~7cm',
    active_time: '밤',
    rarity: '가끔 보여요',
    fun_fact: '수컷의 큰 턱은 다른 수컷과 힘겨루기를 할 때 써요.',
    similar_species: [{ species_id: 'sp_beetle', name: '장수풍뎅이' }],
    is_dangerous: false,
  },
  sp_bee: {
    species_id: 'sp_bee',
    name: '꿀벌',
    scientific_name: 'Apis mellifera',
    group: '곤충',
    habitat: '꽃밭',
    size: '1~2cm',
    active_time: '낮',
    rarity: '흔해요',
    fun_fact: '꽃가루를 옮겨 열매가 열리게 도와주는 고마운 곤충이에요.',
    similar_species: [{ species_id: 'sp_wasp', name: '말벌' }],
    is_dangerous: true,
    safety_notes:
      '쏘일 수 있으니 가까이 가지 말고 멀리서 관찰해요. 벌을 손으로 만지거나 쫓지 마세요.',
  },
};

export function getMockSpeciesCard(speciesId: string): SpeciesCard {
  return SPECIES_CARDS[speciesId] ?? SPECIES_CARDS.sp_ladybug;
}

/** 기존 단일 export 는 호환을 위해 유지 (무당벌레 기준). */
export const mockSpeciesCard: SpeciesCard = SPECIES_CARDS.sp_ladybug;

export const mockIdentify: IdentifyResponse = {
  candidates: [
    { species_id: 'sp_ladybug', confidence: 0.92 },
    { species_id: 'sp_stagbeetle', confidence: 0.05 },
  ],
  is_dangerous: false,
  needs_user_confirmation: false,
};

export const mockPreviewScan: PreviewScanResponse = {
  species_guess: '무당벌레',
  is_dangerous: false,
  confidence: 0.78,
};

const PREVIEW_SCANS: PreviewScanResponse[] = [
  { species_guess: '무당벌레', is_dangerous: false, confidence: 0.78 },
  { species_guess: '나비', is_dangerous: false, confidence: 0.66 },
  { species_guess: '벌', is_dangerous: true, confidence: 0.71 },
];

/** 데모용: 호출마다 안전/위험 결과를 섞어 보여준다(위험은 약 1/3). */
export function pickMockPreviewScan(): PreviewScanResponse {
  return PREVIEW_SCANS[Math.floor(Math.random() * PREVIEW_SCANS.length)];
}

// ─── F1. 온보딩 & 인증 (단일 사용자 계정) ────────────────
export function buildMockSignup(
  email: string,
  nickname: string,
  avatar: string
): SignupResponse {
  return {
    access_token: 'mock_access_token_dev',
    user: { user_id: 'user_mock_1', email, nickname, avatar },
  };
}

export const mockGuestConvert: GuestConvertResponse = {
  migrated_sightings: 1,
};

// ─── F16. 홈 가든 ────────────────────────────────────────
// 6×6 기본 타일 맵. 왼쪽 상단에 물웅덩이, 곳곳에 꽃밭/흙/돌을 배치.
const TILE_MAP: TileType[][] = [
  ['물웅덩이', '물웅덩이', '잔디', '잔디', '꽃밭', '꽃밭'],
  ['물웅덩이', '잔디', '잔디', '잔디', '꽃밭', '잔디'],
  ['잔디', '잔디', '흙', '흙', '잔디', '잔디'],
  ['잔디', '흙', '흙', '잔디', '잔디', '돌'],
  ['꽃밭', '잔디', '잔디', '잔디', '돌', '돌'],
  ['꽃밭', '꽃밭', '잔디', '흙', '흙', '잔디'],
];

function buildDefaultTiles(): GardenTile[] {
  const tiles: GardenTile[] = [];
  for (let row = 0; row < TILE_MAP.length; row++) {
    for (let col = 0; col < TILE_MAP[row].length; col++) {
      tiles.push({ row, col, type: TILE_MAP[row][col] });
    }
  }
  return tiles;
}

export const mockGardenLayout: GardenLayout = {
  tiles: buildDefaultTiles(),
  placements: [],
};

export const mockTileCompatibility: TileCompatibility = {
  곤충: ['잔디', '꽃밭'],
  양서류: ['물웅덩이', '잔디'],
  식물: ['흙', '꽃밭'],
  기타: ['흙', '잔디', '돌'],
};

const STATUS_MESSAGES = [
  '오늘은 기분이 좋아 보여요!',
  '햇살을 쬐며 쉬고 있어요.',
  '당신을 기다리고 있었어요.',
  '주변을 탐험하는 중이에요.',
];

const BOND_MAX = 5;
const REUNION_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 3; // 3일

function seedOf(id: string): number {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

// creatureId → {bond, lastInteractionAt}. F9 상호작용으로 갱신되는 세션 내 상태.
const bondState = new Map<string, { bond: number; lastInteractionAt: number }>();

function getBondEntry(creatureId: string) {
  if (!bondState.has(creatureId)) {
    const seed = seedOf(creatureId);
    bondState.set(creatureId, {
      bond: (seed % BOND_MAX) + 1,
      // 초기값은 "며칠 전"으로 세팅해, 처음 열었을 때 재회 연출이 자연스레 나오게 한다.
      lastInteractionAt: Date.now() - REUNION_THRESHOLD_MS - 1000 * 60 * 60 * (seed % 24),
    });
  }
  return bondState.get(creatureId)!;
}

export function buildMockCreatureStatus(
  creatureId: string,
  nickname: string | null
): CreatureStatus {
  const seed = seedOf(creatureId);
  const entry = getBondEntry(creatureId);
  return {
    creature_id: creatureId,
    nickname,
    days_together: (seed % 30) + 1,
    bond: entry.bond,
    bond_max: BOND_MAX,
    status_message: STATUS_MESSAGES[seed % STATUS_MESSAGES.length],
    is_reunion: Date.now() - entry.lastInteractionAt > REUNION_THRESHOLD_MS,
  };
}

const REACTION_MESSAGES = [
  '기분이 좋아졌어요! 🐾',
  '꼬리를 살랑살랑 흔들어요.',
  '당신 쪽으로 다가와요.',
  '반짝반짝 눈을 빛내요.',
];

/** F9 상호작용(쓰다듬기 등). Bond는 최대치까지 1씩 증가. */
export function interactMockCreature(creatureId: string): InteractResponse {
  const entry = getBondEntry(creatureId);
  const now = Date.now();
  const isReunion = now - entry.lastInteractionAt > REUNION_THRESHOLD_MS;
  const before = entry.bond;

  entry.bond = Math.min(entry.bond + 1, BOND_MAX);
  entry.lastInteractionAt = now;

  return {
    bond: entry.bond,
    bond_max: BOND_MAX,
    bond_leveled_up: entry.bond > before,
    reaction_message: REACTION_MESSAGES[Math.floor(Math.random() * REACTION_MESSAGES.length)],
    is_reunion: isReunion,
  };
}

// ─── F8. 배지 · 레벨 보상 ─────────────────────────────────
let xpState: XPProfile = { level: 3, xp: 180, xp_to_next: 220 };

export function getMockXpProfile(): XPProfile {
  return { ...xpState };
}

function addMockXp(amount: number): XPProfile {
  xpState.xp += amount;
  let leveledUp = false;
  while (xpState.xp >= xpState.xp_to_next) {
    xpState.xp -= xpState.xp_to_next;
    xpState.level += 1;
    xpState.xp_to_next = Math.round(xpState.xp_to_next * 1.25);
    leveledUp = true;
  }
  return { ...xpState, leveled_up: leveledUp };
}

let badgesState: Badge[] = [
  {
    badge_id: 'bd_first_find',
    title: '첫 발견',
    description: '처음으로 생물을 도감에 기록했어요',
    theme: '수집',
    icon: '🔍',
    unlocked: true,
    claimed: true,
  },
  {
    badge_id: 'bd_collector_10',
    title: '수집가',
    description: '10종을 발견했어요',
    theme: '수집',
    icon: '📚',
    unlocked: true,
    claimed: false,
  },
  {
    badge_id: 'bd_explorer',
    title: '탐험가',
    description: '벌처럼 조심스러운 친구도 안전하게 관찰했어요',
    theme: '탐험',
    icon: '🧭',
    unlocked: false,
    claimed: false,
  },
  {
    badge_id: 'bd_bestfriend',
    title: '단짝 친구',
    description: '한 친구와 Bond를 최고치까지 올렸어요',
    theme: '우정',
    icon: '💛',
    unlocked: false,
    claimed: false,
  },
  {
    badge_id: 'bd_streak_3',
    title: '3일 연속 탐험',
    description: '3일 연속으로 앱을 열었어요',
    theme: '연속출석',
    icon: '🔥',
    unlocked: true,
    claimed: false,
  },
];

export function getMockBadges(): Badge[] {
  return badgesState.map((b) => ({ ...b }));
}

export function claimMockBadge(badgeId: string): XPProfile {
  const badge = badgesState.find((b) => b.badge_id === badgeId);
  if (badge && badge.unlocked && !badge.claimed) {
    badge.claimed = true;
    return addMockXp(50);
  }
  return { ...xpState, leveled_up: false };
}

// ─── F10. 퀘스트 ──────────────────────────────────────────
let questsState: Quest[] = [
  {
    quest_id: 'q_ladybug_3',
    title: '무당벌레 친구들',
    description: '무당벌레를 3마리 찾아보세요',
    hint_species_id: 'sp_ladybug',
    progress: 2,
    target: 3,
    status: 'active',
    reward_xp: 30,
  },
  {
    quest_id: 'q_bee_1',
    title: '조심스러운 만남',
    description: '벌을 안전하게 관찰해보세요',
    hint_species_id: 'sp_bee',
    progress: 1,
    target: 1,
    status: 'completed',
    reward_xp: 40,
    reward_badge_id: 'bd_explorer',
  },
  {
    quest_id: 'q_streak_3',
    title: '3일 연속 탐험',
    description: '3일 연속으로 앱을 열어보세요',
    progress: 3,
    target: 3,
    status: 'claimed',
    reward_xp: 20,
  },
];

export function getMockQuests(): Quest[] {
  return questsState.map((q) => ({ ...q }));
}

export function claimMockQuest(questId: string): XPProfile {
  const quest = questsState.find((q) => q.quest_id === questId);
  if (quest && quest.status === 'completed') {
    quest.status = 'claimed';
    if (quest.reward_badge_id) {
      const badge = badgesState.find((b) => b.badge_id === quest.reward_badge_id);
      if (badge) badge.unlocked = true;
    }
    return addMockXp(quest.reward_xp);
  }
  return { ...xpState, leveled_up: false };
}

// ─── F11. 지도 & 탐험 기록 ────────────────────────────────
// v2: 실제 카카오맵 위경도(서울 시내 임의 좌표, 개발용 예시일 뿐 실제 관찰 위치 아님).
export const mockMapPins: MapPin[] = [
  { species_id: 'sp_frog', species_name: '개구리', group: '양서류', lat: 37.5665, lng: 126.978 },
  { species_id: 'sp_ladybug', species_name: '무당벌레', group: '곤충', lat: 37.5651, lng: 126.9895 },
  { species_id: 'sp_butterfly', species_name: '나비', group: '곤충', lat: 37.5633, lng: 126.9751 },
  { species_id: 'sp_snail', species_name: '달팽이', group: '기타', lat: 37.5700, lng: 126.9820 },
];

export const mockExploredRegions: ExploredRegionsResponse = {
  blobs: [],
  home_zone: null,
  current_location: { lat: 37.5665, lng: 126.978 },
};

// ─── F18. 설정 & 계정 관리 ────────────────────────────────
export const mockRestoreBundle: RestoreBundleResponse = {
  dex_count: 15,
  garden_layout_present: false,
  restored_at: new Date().toISOString(),
};
