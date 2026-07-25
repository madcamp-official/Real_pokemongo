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
  // PanResponder.create()는 useRef 초기값이라 마운트 시 딱 한 번만 실행된다 — 그 안에서
  // creature/onDragStart/onDragMove/onDragEnd를 직접 참조하면 "처음 렌더 때의 낡은 값"에
  // 영원히 묶인다. 특히 onDragEnd가 그 시점의 dragging(=아직 null)을 계속 보게 돼,
  // 실제 드래그 시 onDragEnd 맨 앞 `if (!c) return`에서 항상 조용히 끝나버려 배치가 전혀
  // 동작하지 않았다(실기기 테스트로 발견). ref에 최신 값을 담아두고 그걸 통해서만
  // 호출하면 PanResponder 자체는 그대로 유지하면서도 항상 최신 상태를 본다.
  const latest = useRef({ creature, onDragStart, onDragMove, onDragEnd });
  latest.current = { creature, onDragStart, onDragMove, onDragEnd };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        latest.current.onDragStart(latest.current.creature);
        latest.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        latest.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderRelease: (e: GestureResponderEvent) => {
        latest.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderTerminate: (e: GestureResponderEvent) => {
        latest.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY);
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
