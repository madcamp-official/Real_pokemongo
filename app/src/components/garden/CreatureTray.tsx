import { useRef, useState } from 'react';
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
  const message =
    tab === 'friends'
      ? creatures.length > 0
        ? '친구를 끌어 정원에 놓아보세요'
        : '모든 친구가 정원에서 쉬고 있어요'
      : decorations.some((item) => item.unlocked)
        ? '해금한 장식을 끌어 정원을 채워보세요'
        : '도감을 채우면 첫 장식이 열려요';

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
        <Text style={styles.message} numberOfLines={1}>{message}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    height: 76,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,252,239,0.94)',
    borderRadius: 20,
    padding: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#425D30',
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 8,
  },
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
  content: { flex: 1, minWidth: 0 },
  message: { height: 18, fontSize: 10, fontWeight: '800', color: '#65705B' },
  trayRow: { gap: 8, paddingRight: 8, alignItems: 'center' },
  chip: { width: 48, alignItems: 'center', gap: 1 },
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
  chipName: { maxWidth: 50, fontSize: 8, fontWeight: '800', color: colors.textPrimary },
});
