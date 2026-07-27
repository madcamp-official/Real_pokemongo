export type DecorationId =
  | 'flower-bed'
  | 'fence'
  | 'pond'
  | 'fruit-tree'
  | 'bench'
  | 'bridge'
  | 'flower-arch';

export interface DecorationDefinition {
  id: DecorationId;
  name: string;
  icon: string;
  requiredSpecies: number;
  requiredLevel: number;
  width: number;
  height: number;
}

export interface DecorationPlacement {
  id: string;
  decorationId: DecorationId;
  x: number;
  y: number;
}

export const DECORATIONS: DecorationDefinition[] = [
  { id: 'flower-bed', name: '꽃밭', icon: '🌷', requiredSpecies: 1, requiredLevel: 1, width: 96, height: 62 },
  { id: 'fence', name: '울타리', icon: '🪵', requiredSpecies: 2, requiredLevel: 1, width: 112, height: 54 },
  { id: 'pond', name: '연못', icon: '💧', requiredSpecies: 3, requiredLevel: 1, width: 174, height: 105 },
  { id: 'fruit-tree', name: '열매나무', icon: '🌳', requiredSpecies: 4, requiredLevel: 2, width: 104, height: 138 },
  { id: 'bench', name: '벤치', icon: '🪑', requiredSpecies: 5, requiredLevel: 3, width: 118, height: 76 },
  { id: 'bridge', name: '나무다리', icon: '🌉', requiredSpecies: 6, requiredLevel: 5, width: 126, height: 70 },
  { id: 'flower-arch', name: '꽃 아치', icon: '🌸', requiredSpecies: 8, requiredLevel: 5, width: 112, height: 132 },
];

export function isDecorationUnlocked(
  decoration: DecorationDefinition,
  speciesCount: number,
  level: number
): boolean {
  return speciesCount >= decoration.requiredSpecies && level >= decoration.requiredLevel;
}
