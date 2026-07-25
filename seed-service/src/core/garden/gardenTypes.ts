/**
 * F16 홈가든 도메인 타입 (D단계 이후 구현).
 *
 * DB(`db/schema.sql`)는 영문 코드(tile_type enum)로 저장하지만, 프론트(app/src/types/api.ts
 * TileType)는 한글 라벨을 쓴다 — 이 파일이 그 경계에서 유일하게 변환을 담당한다.
 */
import type { CreatureId } from "../domain/types.js";

/** DB의 tile_type enum과 1:1. */
export type TileType = "grass" | "water_pool" | "soil" | "rock" | "flower_bed";

export interface GardenTile {
  row: number;
  col: number;
  type: TileType;
}

export interface CreaturePlacement {
  row: number;
  col: number;
  creatureId: CreatureId;
}

/** 항상 GardenRepository.getLayout(userId)처럼 특정 사용자 범위로만 조회/저장되므로,
 * 이 값 자체엔 userId를 담지 않는다(호출부가 이미 스코프를 쥐고 있음). */
export interface GardenLayout {
  tiles: GardenTile[];
  placements: CreaturePlacement[];
}

/** DB 영문 코드 → 프론트 한글 라벨(db/schema.sql 상단 주석과 동일한 매핑). */
export const TILE_TYPE_TO_KOREAN: Record<TileType, string> = {
  grass: "잔디",
  water_pool: "물웅덩이",
  soil: "흙",
  rock: "돌",
  flower_bed: "꽃밭",
};

const KOREAN_TO_TILE_TYPE: Record<string, TileType> = {
  잔디: "grass",
  물웅덩이: "water_pool",
  흙: "soil",
  돌: "rock",
  꽃밭: "flower_bed",
};

/** 프론트가 보낸 한글 라벨을 도메인 TileType으로. 모르는 값은 null(호출부가 400 처리). */
export function tileTypeFromKorean(label: string): TileType | null {
  return KOREAN_TO_TILE_TYPE[label] ?? null;
}

// 6×6 기본 정원. app/src/mocks/mockData.ts의 TILE_MAP과 동일한 배치(한글→영문 변환값) —
// 사용자가 한 번도 저장한 적 없을 때(GET /garden/layout) 이 값을 그대로 돌려준다(DB엔 안 씀,
// 실제로 저장은 사용자가 처음 PUT할 때 일어난다).
const DEFAULT_TILE_ROWS: TileType[][] = [
  ["water_pool", "water_pool", "grass", "grass", "flower_bed", "flower_bed"],
  ["water_pool", "grass", "grass", "grass", "flower_bed", "grass"],
  ["grass", "grass", "soil", "soil", "grass", "grass"],
  ["grass", "soil", "soil", "grass", "grass", "rock"],
  ["flower_bed", "grass", "grass", "grass", "rock", "rock"],
  ["flower_bed", "flower_bed", "grass", "soil", "soil", "grass"],
];

export function buildDefaultTiles(): GardenTile[] {
  const tiles: GardenTile[] = [];
  for (let row = 0; row < DEFAULT_TILE_ROWS.length; row++) {
    const cols = DEFAULT_TILE_ROWS[row]!;
    for (let col = 0; col < cols.length; col++) {
      tiles.push({ row, col, type: cols[col]! });
    }
  }
  return tiles;
}
