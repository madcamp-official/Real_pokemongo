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

export function buildMockCreatureStatus(
  creatureId: string,
  nickname: string | null
): CreatureStatus {
  // days_together, bond 는 creatureId 해시로 안정적인 더미 값 생성.
  const seed = creatureId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    creature_id: creatureId,
    nickname,
    days_together: (seed % 30) + 1,
    bond: (seed % 5) + 1,
    bond_max: 5,
    status_message: STATUS_MESSAGES[seed % STATUS_MESSAGES.length],
  };
}

// ─── F18. 설정 & 계정 관리 ────────────────────────────────
export const mockRestoreBundle: RestoreBundleResponse = {
  dex_count: 15,
  garden_layout_present: false,
  restored_at: new Date().toISOString(),
};
