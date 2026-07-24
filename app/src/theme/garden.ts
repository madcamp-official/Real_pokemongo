import type { TileType } from '@/types/api';

/**
 * 홈 가든 isometric 렌더링 상수 + 좌표 변환 (F16).
 *
 * 아이소메트릭 투영: 격자 (row,col) → 화면 좌표.
 *   x = (col - row) * TILE_W/2
 *   y = (col + row) * TILE_H/2
 * 타일은 2:1 비율 다이아몬드로, 45° 회전 + 세로 스케일로 표현한다.
 */
export const GRID_N = 6;
export const TILE_W = 52;
export const TILE_H = 26;
export const PAD = 8;

/** 격자 원점 보정: col-row 의 최소값 -(N-1) 을 0 이상으로 밀어준다. */
const ORIGIN_X = PAD + ((GRID_N - 1) * TILE_W) / 2;
const ORIGIN_Y = PAD;

export const GRID_WIDTH = 2 * PAD + GRID_N * TILE_W;
export const GRID_HEIGHT = 2 * PAD + GRID_N * TILE_H + TILE_H;

/** 타일 중심의 화면 좌표. */
export function tileCenter(row: number, col: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + ((col - row) * TILE_W) / 2,
    y: ORIGIN_Y + ((col + row) * TILE_H) / 2 + TILE_H / 2,
  };
}

/** 화면 좌표(격자 컨테이너 기준) → 가장 가까운 타일 (범위 밖이면 null). */
export function screenToTile(px: number, py: number): { row: number; col: number } | null {
  const x = px - ORIGIN_X;
  const y = py - (ORIGIN_Y + TILE_H / 2);
  const col = Math.round(x / TILE_W + y / TILE_H);
  const row = Math.round(y / TILE_H - x / TILE_W);
  if (row < 0 || row >= GRID_N || col < 0 || col >= GRID_N) return null;
  return { row, col };
}

export const TILE_COLORS: Record<TileType, { top: string; side: string }> = {
  잔디: { top: '#A7D48A', side: '#8FBE6F' },
  물웅덩이: { top: '#8FD0E8', side: '#6FB6D6' },
  흙: { top: '#D8B98C', side: '#C09E70' },
  돌: { top: '#C4C0BA', side: '#A8A39B' },
  꽃밭: { top: '#F2B8C6', side: '#E098AC' },
};
