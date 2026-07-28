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
const SCENE_TOP = 34;

/** 격자 원점 보정: col-row 의 최소값 -(N-1) 을 0 이상으로 밀어준다. */
const ORIGIN_X = PAD + ((GRID_N - 1) * TILE_W) / 2;
const ORIGIN_Y = SCENE_TOP;

export const GRID_WIDTH = 360;
export const GRID_HEIGHT = 480;

/** 2D 정원 배경에서 6×6 논리 좌표가 놓이는 백분율 위치. */
export function gardenPointPercent(row: number, col: number): { x: number; y: number } {
  return {
    x: 24 + col * 9.2 + row * 3.1,
    y: 42 + row * 7.2 - col * 1.3,
  };
}

/** 타일 중심의 화면 좌표. */
export function tileCenter(row: number, col: number): { x: number; y: number } {
  return {
    x: ORIGIN_X + ((col - row) * TILE_W) / 2,
    y: ORIGIN_Y + ((col + row) * TILE_H) / 2 + TILE_H / 2,
  };
}

/** 화면 좌표(격자 컨테이너 기준) → 가장 가까운 타일 (범위 밖이면 null). */
export function screenToTile(
  px: number,
  py: number,
  viewportWidth = GRID_WIDTH,
  viewportHeight = GRID_HEIGHT,
  allowedCoordinates?: ReadonlySet<string>
): { row: number; col: number } | null {
  let best: { row: number; col: number; distance: number } | null = null;
  for (let row = 0; row < GRID_N; row++) {
    for (let col = 0; col < GRID_N; col++) {
      if (allowedCoordinates && !allowedCoordinates.has(`${row},${col}`)) continue;
      const point = gardenPointPercent(row, col);
      const sx = (point.x / 100) * viewportWidth;
      const sy = (point.y / 100) * viewportHeight;
      const distance = Math.hypot(px - sx, py - sy);
      if (!best || distance < best.distance) best = { row, col, distance };
    }
  }
  // 넓은 2D 배경에서는 손가락을 정확히 슬롯 중앙에 놓지 않아도 가장 가까운
  // 호환 자리로 자연스럽게 스냅한다. 후보가 제한된 생물도 빈 공간에 쉽게 놓인다.
  const snapRadius = Math.max(70, Math.min(112, viewportWidth * 0.08));
  return best && best.distance <= snapRadius
    ? { row: best.row, col: best.col }
    : null;
}

export const TILE_COLORS: Record<TileType, { top: string; side: string }> = {
  잔디: { top: '#A7D48A', side: '#8FBE6F' },
  물웅덩이: { top: '#8FD0E8', side: '#6FB6D6' },
  흙: { top: '#D8B98C', side: '#C09E70' },
  돌: { top: '#C4C0BA', side: '#A8A39B' },
  꽃밭: { top: '#F2B8C6', side: '#E098AC' },
};
