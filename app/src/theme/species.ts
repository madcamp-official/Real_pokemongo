import { pastels, type PastelKey } from '@/theme/colors';

/**
 * 종별 임시 일러스트 매핑 (Phase 3).
 * 실제 일러스트/3D 에셋은 F7 및 디자인 핸드오프에서 교체된다. 지금은 이모지 + 파스텔
 * 배경으로 시안의 "컬러 원형 썸네일" 느낌을 근사한다.
 */
export interface SpeciesVisual {
  emoji: string;
  pastel: PastelKey;
}

const VISUALS: Record<string, SpeciesVisual> = {
  sp_ladybug: { emoji: '🐞', pastel: 'pink' },
  sp_stagbeetle: { emoji: '🪲', pastel: 'tan' },
  sp_frog: { emoji: '🐸', pastel: 'green' },
  sp_snail: { emoji: '🐌', pastel: 'cream' },
  sp_ant: { emoji: '🐜', pastel: 'gray' },
  sp_butterfly: { emoji: '🦋', pastel: 'purple' },
  sp_bee: { emoji: '🐝', pastel: 'cream' },
  sp_beetle: { emoji: '🪲', pastel: 'tan' },
};

const FALLBACK: SpeciesVisual = { emoji: '❓', pastel: 'gray' };

export function getSpeciesVisual(speciesId: string): SpeciesVisual {
  return VISUALS[speciesId] ?? FALLBACK;
}

export function getPastel(key: PastelKey): string {
  return pastels[key];
}
