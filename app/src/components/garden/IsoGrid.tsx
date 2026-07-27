import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GRID_WIDTH, GRID_HEIGHT, TILE_H, tileCenter } from '@/theme/garden';
import { CreatureArt } from '@/components/species/CreatureArt';
import type { GardenTile, Placement } from '@/types/api';
import { IsoTile } from '@/components/garden/IsoTile';

const MARKER = 40;

interface Props {
  tiles: GardenTile[];
  placements: Placement[];
  isDragging: boolean;
  compatibleTiles: Set<string>;
  onCreaturePress: (creatureId: string) => void;
}

/**
 * 아이소메트릭 6×6 격자 + 배치된 개체 렌더링 (F16).
 * 드롭 좌표 계산을 위해 컨테이너 View 를 ref 로 노출한다(screenToTile 과 함께 사용).
 */
export const IsoGrid = forwardRef<View, Props>(function IsoGrid(
  { tiles, placements, isDragging, compatibleTiles, onCreaturePress },
  ref
) {
  // 뒤쪽(row+col 작음) → 앞쪽 순으로 그려 겹침이 자연스럽게 보이도록 정렬.
  const ordered = [...placements].sort((a, b) => a.row + a.col - (b.row + b.col));

  return (
    <View ref={ref} collapsable={false} style={styles.container}>
      {tiles.map((t) => {
        const key = `${t.row},${t.col}`;
        const compatible = compatibleTiles.has(key);
        return (
          <IsoTile
            key={key}
            row={t.row}
            col={t.col}
            type={t.type}
            highlighted={isDragging && compatible}
            dimmed={isDragging && !compatible}
          />
        );
      })}

      {ordered.map((p) => {
        const { x, y } = tileCenter(p.row, p.col);
        return (
          <Pressable
            key={p.creature_id}
            onPress={() => onCreaturePress(p.creature_id)}
            style={[
              styles.marker,
              { left: x - MARKER / 2, top: y - MARKER + TILE_H / 2 },
            ]}
          >
            <CreatureArt speciesId={p.species_id} size={MARKER * 0.86} />
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: GRID_WIDTH, height: GRID_HEIGHT },
  marker: { position: 'absolute', width: MARKER, height: MARKER, alignItems: 'center', justifyContent: 'center' },
  markerEmoji: { fontSize: 30 },
});
