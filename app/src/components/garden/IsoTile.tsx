import { StyleSheet, View } from 'react-native';
import { TILE_W, TILE_H, TILE_COLORS, tileCenter } from '@/theme/garden';
import type { TileType } from '@/types/api';

const DIAMOND_SIDE = TILE_W / Math.SQRT2;

/**
 * 아이소메트릭 다이아몬드 타일 하나 (F16).
 * 정사각형을 45° 회전 + 세로 0.5 스케일하여 2:1 다이아몬드로 만든다.
 */
interface Props {
  row: number;
  col: number;
  type: TileType;
  highlighted?: boolean;
  dimmed?: boolean;
}

export function IsoTile({ row, col, type, highlighted, dimmed }: Props) {
  const { x, y } = tileCenter(row, col);
  const palette = TILE_COLORS[type];

  return (
    <View
      pointerEvents="none"
      style={[styles.wrapper, { left: x - TILE_W / 2, top: y - TILE_H / 2 }]}
    >
      <View
        style={[
          styles.diamond,
          { backgroundColor: palette.top, borderColor: palette.side },
          highlighted && styles.highlighted,
          dimmed && styles.dimmed,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: TILE_W,
    height: TILE_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    width: DIAMOND_SIDE,
    height: DIAMOND_SIDE,
    borderWidth: 1.5,
    borderRadius: 4,
    transform: [{ rotate: '45deg' }, { scaleY: 0.5 }],
  },
  highlighted: { borderColor: '#fff', borderWidth: 2.5 },
  dimmed: { opacity: 0.45 },
});
