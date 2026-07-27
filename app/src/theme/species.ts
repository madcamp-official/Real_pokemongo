import { pastels, type PastelKey } from '@/theme/colors';

/**
 * 종별 배경 톤 매핑.
 *
 * 그림 자체는 components/species/CreatureArt 가 SVG 로 그린다 — 여기서는 썸네일·히어로
 * 뒤에 깔리는 파스텔 배경색만 정한다.
 *
 * 키는 백엔드 시드 종 ID(`taxon-ladybug`) 기준이다. 예전에는 mock 전용 ID(`sp_ladybug`)만
 * 있어서 실제 서버 응답이 전부 폴백(❓)으로 떨어졌다 — 두 형태를 모두 받도록 정규화한다.
 */
export interface SpeciesVisual {
  /** CreatureArt 도입 전 폴백용. 그림이 없는 종에서만 쓰인다. */
  emoji: string;
  pastel: PastelKey;
}

const VISUALS: Record<string, SpeciesVisual> = {
  // 곤충
  ladybug: { emoji: '🐞', pastel: 'pink' },
  'cabbage-white': { emoji: '🦋', pastel: 'purple' },
  honeybee: { emoji: '🐝', pastel: 'cream' },
  // 식물
  dandelion: { emoji: '🌼', pastel: 'cream' },
  forsythia: { emoji: '🌸', pastel: 'cream' },
  dayflower: { emoji: '💠', pastel: 'blue' },
  'lacquer-tree': { emoji: '🍁', pastel: 'tan' },
  // 버섯
  'fly-agaric': { emoji: '🍄', pastel: 'pink' },

  // 초기 mock 데이터 전용 별칭(개발 중 mock 모드 호환)
  butterfly: { emoji: '🦋', pastel: 'purple' },
  bee: { emoji: '🐝', pastel: 'cream' },
  stagbeetle: { emoji: '🪲', pastel: 'tan' },
  beetle: { emoji: '🪲', pastel: 'tan' },
  frog: { emoji: '🐸', pastel: 'green' },
  snail: { emoji: '🐌', pastel: 'cream' },
  ant: { emoji: '🐜', pastel: 'gray' },
};

const FALLBACK: SpeciesVisual = { emoji: '❓', pastel: 'gray' };

/** `taxon-ladybug` / `sp_ladybug` 를 모두 `ladybug` 로 맞춘다. */
function normalizeId(speciesId: string): string {
  return speciesId.replace(/^(taxon-|sp_)/, '').replace(/_/g, '-');
}

export function getSpeciesVisual(speciesId: string): SpeciesVisual {
  return VISUALS[normalizeId(speciesId)] ?? FALLBACK;
}

export function getPastel(key: PastelKey): string {
  return pastels[key];
}
