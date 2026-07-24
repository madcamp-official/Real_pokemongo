import { useRef } from 'react';
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import type { TaxonGroup } from '@/types/api';

export interface OwnedCreature {
  id: string;
  species_id: string;
  name: string;
  group: TaxonGroup;
  displayName: string;
}

interface DraggableProps {
  creature: OwnedCreature;
  onDragStart: (c: OwnedCreature) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
}

function DraggableCreature({ creature, onDragStart, onDragMove, onDragEnd }: DraggableProps) {
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        onDragStart(creature);
        onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderRelease: (e: GestureResponderEvent) => {
        onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderTerminate: (e: GestureResponderEvent) => {
        onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
    })
  ).current;

  const visual = getSpeciesVisual(creature.species_id);

  return (
    <View style={styles.chip} {...responder.panHandlers}>
      <View style={[styles.chipThumb, { backgroundColor: getPastel(visual.pastel) }]}>
        <Text style={styles.chipEmoji}>{visual.emoji}</Text>
      </View>
      <Text style={styles.chipName} numberOfLines={1}>
        {creature.displayName}
      </Text>
    </View>
  );
}

interface TrayProps {
  creatures: OwnedCreature[];
  onDragStart: (c: OwnedCreature) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
}

/**
 * 아직 배치하지 않은 보유 개체 트레이 (F16).
 * 칩을 드래그해 격자에 놓는다.
 */
export function CreatureTray({ creatures, onDragStart, onDragMove, onDragEnd }: TrayProps) {
  return (
    <View style={styles.tray}>
      <Text style={styles.trayTitle}>친구들을 정원에 놓아보세요</Text>
      {creatures.length === 0 ? (
        <Text style={styles.empty}>모든 친구를 정원에 배치했어요 🌿</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayRow}>
          {creatures.map((c) => (
            <DraggableCreature
              key={c.id}
              creature={c}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  trayTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  empty: { fontSize: 14, color: colors.textSecondary, paddingVertical: 12 },
  trayRow: { gap: 12, paddingRight: 8 },
  chip: { width: 66, alignItems: 'center', gap: 6 },
  chipThumb: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipEmoji: { fontSize: 28 },
  chipName: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
});
