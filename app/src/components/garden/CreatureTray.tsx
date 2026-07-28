import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { GardenCreatureArt } from '@/components/garden/GardenCreatureArt';
import type { DecorationDefinition } from '@/components/garden/gardenDecorations';
import type { TaxonGroup } from '@/types/api';

export interface OwnedCreature {
  id: string;
  species_id: string;
  name: string;
  group: TaxonGroup;
  displayName: string;
}

type DragCallbacks<T> = {
  item: T;
  onDragStart: (item: T) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
};

function useDragResponder<T>(callbacks: DragCallbacks<T>, enabled = true) {
  const latest = useRef({ callbacks, enabled });
  latest.current = { callbacks, enabled };
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.enabled,
      onMoveShouldSetPanResponder: () => latest.current.enabled,
      onPanResponderGrant: (event: GestureResponderEvent) => {
        const { callbacks: current } = latest.current;
        current.onDragStart(current.item);
        current.onDragMove(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderMove: (event: GestureResponderEvent) => {
        latest.current.callbacks.onDragMove(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderRelease: (event: GestureResponderEvent) => {
        latest.current.callbacks.onDragEnd(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderTerminate: (event: GestureResponderEvent) => {
        latest.current.callbacks.onDragEnd(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
    })
  ).current;
}

function CreatureChip(props: {
  creature: OwnedCreature;
  onDragStart: (item: OwnedCreature) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
}) {
  const responder = useDragResponder({
    item: props.creature,
    onDragStart: props.onDragStart,
    onDragMove: props.onDragMove,
    onDragEnd: props.onDragEnd,
  });
  const visual = getSpeciesVisual(props.creature.species_id);
  return (
    <View style={styles.chip} {...responder.panHandlers}>
      <View style={[styles.chipThumb, { backgroundColor: getPastel(visual.pastel) }]}>
        <GardenCreatureArt speciesId={props.creature.species_id} size={34} />
      </View>
      <Text style={styles.chipName} numberOfLines={1}>{props.creature.displayName}</Text>
    </View>
  );
}

function DecorationChip(props: {
  decoration: DecorationDefinition;
  unlocked: boolean;
  onDragStart: (item: DecorationDefinition) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
}) {
  const responder = useDragResponder(
    {
      item: props.decoration,
      onDragStart: props.onDragStart,
      onDragMove: props.onDragMove,
      onDragEnd: props.onDragEnd,
    },
    props.unlocked
  );
  return (
    <View style={[styles.chip, !props.unlocked && styles.lockedChip]} {...responder.panHandlers}>
      <View style={[styles.chipThumb, styles.decorThumb]}>
        <Text style={styles.decorIcon}>{props.unlocked ? props.decoration.icon : '🔒'}</Text>
      </View>
      <Text style={styles.chipName} numberOfLines={1}>
        {props.unlocked ? props.decoration.name : `도감 ${props.decoration.requiredSpecies}`}
      </Text>
    </View>
  );
}

interface Props {
  creatures: OwnedCreature[];
  decorations: Array<{ definition: DecorationDefinition; unlocked: boolean }>;
  onCreatureDragStart: (item: OwnedCreature) => void;
  onDecorationDragStart: (item: DecorationDefinition) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
}

export function CreatureTray({
  creatures,
  decorations,
  onCreatureDragStart,
  onDecorationDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const [tab, setTab] = useState<'friends' | 'decorations'>('friends');
  const [expanded, setExpanded] = useState(false);
  const hasAvailableItem = creatures.length > 0 || decorations.some((item) => item.unlocked);

  // 새 친구나 장식이 생겼을 때 한 번 자동으로 열어 발견을 놓치지 않게 한다.
  useEffect(() => {
    if (hasAvailableItem) setExpanded(true);
  }, [hasAvailableItem]);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel="정원 배치 목록 열기"
        style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
      >
        <Text style={styles.launcherIcon}>🐾</Text>
        <Text style={styles.launcherText}>배치 목록</Text>
        {creatures.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{creatures.length}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.tray}>
      <View style={styles.tabColumn}>
        <Pressable
          onPress={() => setTab('friends')}
          style={[styles.tabButton, tab === 'friends' && styles.activeTab]}
        >
          <Text style={styles.tabIcon}>🐾</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('decorations')}
          style={[styles.tabButton, tab === 'decorations' && styles.activeTab]}
        >
          <Text style={styles.tabIcon}>🛠️</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trayRow}
        >
          {tab === 'friends'
            ? creatures.map((creature) => (
                <CreatureChip
                  key={creature.id}
                  creature={creature}
                  onDragStart={onCreatureDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))
            : decorations.map(({ definition, unlocked }) => (
                <DecorationChip
                  key={definition.id}
                  decoration={definition}
                  unlocked={unlocked}
                  onDragStart={onDecorationDragStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))}
        </ScrollView>
      </View>
      <Pressable
        onPress={() => setExpanded(false)}
        accessibilityRole="button"
        accessibilityLabel="정원 배치 목록 접기"
        style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
      >
        <Text style={styles.closeIcon}>⌄</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    height: 70,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,252,239,0.94)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#425D30',
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 8,
  },
  launcher: {
    position: 'absolute',
    left: 16,
    bottom: 12,
    height: 44,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 22,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    backgroundColor: 'rgba(255,252,239,0.96)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#425D30',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  launcherIcon: { fontSize: 18 },
  launcherText: { fontSize: 12, fontWeight: '900', color: '#53634A' },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6F955B',
  },
  countText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  tabColumn: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingRight: 8 },
  tabButton: {
    width: 37,
    height: 37,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E4D3',
  },
  activeTab: { backgroundColor: '#FFC65B' },
  tabIcon: { fontSize: 18 },
  content: { flex: 1, minWidth: 0, justifyContent: 'center' },
  trayRow: { gap: 7, paddingRight: 10, paddingBottom: 2, alignItems: 'center' },
  closeButton: {
    width: 32,
    height: 32,
    marginLeft: 4,
    alignSelf: 'center',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E4D3',
  },
  closeIcon: { marginTop: -5, fontSize: 23, fontWeight: '900', color: '#64705A' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  chip: { width: 72, alignItems: 'center', gap: 1 },
  lockedChip: { opacity: 0.52 },
  chipThumb: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorThumb: { backgroundColor: '#E8F0D6' },
  decorIcon: { fontSize: 22 },
  chipName: {
    width: 72,
    minHeight: 13,
    lineHeight: 12,
    paddingBottom: 1,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
    color: colors.textPrimary,
  },
});
