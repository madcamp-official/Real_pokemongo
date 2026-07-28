import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { fetchDex } from '@/api/dex';
import { fetchTileCompatibility } from '@/api/garden';
import { useGardenStore } from '@/store/gardenStore';
import {
  GARDEN_WORLD_HEIGHT,
  GARDEN_WORLD_WIDTH,
  GardenScene2D,
  type GardenCreatureMeta,
  type GardenTransform,
} from '@/components/garden/GardenScene2D';
import { CreatureTray, type OwnedCreature } from '@/components/garden/CreatureTray';
import { CreatureStatusSheet } from '@/components/garden/CreatureStatusSheet';
import {
  GardenCreatureArt,
  hasGardenCreatureArt,
} from '@/components/garden/GardenCreatureArt';
import {
  DECORATIONS,
  isDecorationUnlocked,
  type DecorationDefinition,
} from '@/components/garden/gardenDecorations';
import { screenToTile } from '@/theme/garden';
import { useRewardsStore } from '@/store/rewardsStore';
import type { RootTabParamList } from '@/navigation/types';

/**
 * 화면보다 큰 2D 정원을 탐색하고, 발견한 동식물과 해금한 장식을 배치한다.
 */
export default function GardenScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const introOpacity = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      introOpacity.setValue(1);
      const introTimer = setTimeout(() => {
        Animated.timing(introOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start();
      }, 2400);
      return () => {
        clearTimeout(introTimer);
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [introOpacity])
  );

  const tiles = useGardenStore((s) => s.tiles);
  const placements = useGardenStore((s) => s.placements);
  const decorations = useGardenStore((s) => s.decorations);
  const loadFromServer = useGardenStore((s) => s.loadFromServer);
  const placeCreature = useGardenStore((s) => s.placeCreature);
  const removeCreature = useGardenStore((s) => s.removeCreature);
  const placeDecoration = useGardenStore((s) => s.placeDecoration);
  const removeDecoration = useGardenStore((s) => s.removeDecoration);

  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });
  const compatQuery = useQuery({ queryKey: ['tile-compat'], queryFn: fetchTileCompatibility });
  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  const owned: OwnedCreature[] = useMemo(() => {
    const list: OwnedCreature[] = [];
    for (const e of dexQuery.data ?? []) {
      if (!e.discovered || !hasGardenCreatureArt(e.species_id)) continue;
      for (const cr of e.creatures) {
        list.push({
          id: cr.id,
          species_id: e.species_id,
          name: e.name,
          group: e.group,
          displayName: e.name,
        });
      }
    }
    return list;
  }, [dexQuery.data]);

  const placedIds = useMemo(() => new Set(placements.map((p) => p.creature_id)), [placements]);
  const trayCreatures = owned.filter((c) => !placedIds.has(c.id));
  const gardenCreatures: GardenCreatureMeta[] = useMemo(
    () =>
      owned.map((creature) => ({
        creatureId: creature.id,
        speciesId: creature.species_id,
        group: creature.group,
      })),
    [owned]
  );
  const supportedPlacements = useMemo(
    () => placements.filter((placement) => hasGardenCreatureArt(placement.species_id)),
    [placements]
  );
  const discoveredCount = useMemo(
    () => (dexQuery.data ?? []).filter((entry) => entry.discovered).length,
    [dexQuery.data]
  );

  // ── 드래그 상태 ──────────────────────────────────────────────
  const rootRef = useRef<View>(null);
  const gridRef = useRef<View>(null);
  const rootOrigin = useRef({ x: 0, y: 0 });
  const gridOrigin = useRef({ x: 0, y: 0 });
  const gridSize = useRef({ width: 360, height: 480 });
  const gardenTransform = useRef<GardenTransform>({
    translateX: 0,
    translateY: 0,
    scale: 0.82,
  });

  const [draggingCreature, setDraggingCreature] = useState<OwnedCreature | null>(null);
  const [movingCreature, setMovingCreature] = useState<OwnedCreature | null>(null);
  const [draggingDecoration, setDraggingDecoration] = useState<DecorationDefinition | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const compatibleTiles = useMemo(() => {
    const set = new Set<string>();
    const creature = draggingCreature ?? movingCreature;
    if (!creature) return set;
    const allowed = compatQuery.data?.[creature.group] ?? [];
    const occupied = new Set(placements.map((placement) => `${placement.row},${placement.col}`));
    for (const t of tiles) {
      const key = `${t.row},${t.col}`;
      if (allowed.includes(t.type) && !occupied.has(key)) set.add(key);
    }
    return set;
  }, [draggingCreature, movingCreature, compatQuery.data, placements, tiles]);

  const flashWarn = (msg: string) => {
    setWarn(msg);
    setTimeout(() => setWarn(null), 1400);
  };

  const measureGarden = () => {
    rootRef.current?.measureInWindow((x, y) => (rootOrigin.current = { x, y }));
    gridRef.current?.measureInWindow((x, y, width, height) => {
      gridOrigin.current = { x, y };
      gridSize.current = { width, height };
    });
  };

  const onCreatureDragStart = (creature: OwnedCreature) => {
    setDraggingCreature(creature);
    setMovingCreature(null);
    setDraggingDecoration(null);
    measureGarden();
  };

  const onDecorationDragStart = (decoration: DecorationDefinition) => {
    setDraggingDecoration(decoration);
    setDraggingCreature(null);
    setMovingCreature(null);
    measureGarden();
  };

  const onDragMove = (pageX: number, pageY: number) =>
    setDragPos({ x: pageX - rootOrigin.current.x, y: pageY - rootOrigin.current.y });

  const onDragEnd = (pageX: number, pageY: number) => {
    const creature = draggingCreature;
    const decoration = draggingDecoration;
    setDraggingCreature(null);
    setDraggingDecoration(null);
    setDragPos(null);
    if (!creature && !decoration) return;

    const localX = pageX - gridOrigin.current.x;
    const localY = pageY - gridOrigin.current.y;
    if (
      localX < 0 ||
      localY < 0 ||
      localX > gridSize.current.width ||
      localY > gridSize.current.height
    ) {
      return;
    }

    const transform = gardenTransform.current;
    const worldX = (localX - transform.translateX) / transform.scale;
    const worldY = (localY - transform.translateY) / transform.scale;

    if (decoration) {
      const x = (worldX / GARDEN_WORLD_WIDTH) * 100;
      const y = (worldY / GARDEN_WORLD_HEIGHT) * 100;
      if (x < 2 || x > 98 || y < 8 || y > 94) return;
      if ((level < 3 && x < 22) || (level < 5 && x > 78)) {
        flashWarn('아직 열리지 않은 정원 구역이에요');
        return;
      }
      placeDecoration(decoration.id, x, y);
      return;
    }

    const tile = screenToTile(
      worldX,
      worldY,
      GARDEN_WORLD_WIDTH,
      GARDEN_WORLD_HEIGHT,
      compatibleTiles
    );
    if (!tile) {
      flashWarn(`${creature!.name}이(가) 갈 수 있는 정원 안쪽에 놓아주세요`);
      return;
    }

    placeCreatureAt(creature!, tile.row, tile.col);
  };

  const placeCreatureAt = (creature: OwnedCreature, row: number, col: number) => {
    const tileObj = tiles.find((tile) => tile.row === row && tile.col === col);
    const allowed = compatQuery.data?.[creature.group] ?? [];
    if (!tileObj || !allowed.includes(tileObj.type)) {
      flashWarn(`${creature.name}은(는) 이 장소에 갈 수 없어요`);
      return false;
    }
    const ok = placeCreature({
      creature_id: creature.id,
      species_id: creature.species_id,
      row,
      col,
    });
    if (!ok) flashWarn('이미 친구가 있는 자리예요');
    return ok;
  };

  const startMovingPlacedCreature = (creatureId: string) => {
    const creature = owned.find((item) => item.id === creatureId);
    if (!creature) return;
    setSelectedId(null);
    setDraggingCreature(null);
    setDraggingDecoration(null);
    setMovingCreature(creature);
  };

  const moveToCompatibleTile = (row: number, col: number) => {
    if (!movingCreature) return;
    if (placeCreatureAt(movingCreature, row, col)) {
      setMovingCreature(null);
    }
  };

  // ── 상태 시트 ────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlacement = placements.find((p) => p.creature_id === selectedId) ?? null;
  const selectedCreature = owned.find((creature) => creature.id === selectedId) ?? null;

  const level = useRewardsStore((s) => s.level);
  const decorationInventory = useMemo(
    () =>
      DECORATIONS.map((definition) => ({
        definition,
        unlocked: isDecorationUnlocked(definition, discoveredCount, level),
      })),
    [discoveredCount, level]
  );

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      <View style={styles.gridArea}>
        <View style={styles.gridFrame}>
          <GardenScene2D
            ref={gridRef}
            tiles={tiles}
            placements={supportedPlacements}
            decorations={decorations}
            creatures={gardenCreatures}
            level={level}
            // 트레이에서 끌 때는 배경을 슬롯으로 덮지 않는다. 기존 친구를 길게 눌러
            // 옮길 때만 작은 위치 표식을 보여 탭 이동 가능성을 유지한다.
            isDragging={!!movingCreature}
            compatibleTiles={compatibleTiles}
            onCreaturePress={setSelectedId}
            onCreatureMoveStart={startMovingPlacedCreature}
            onCompatibleTilePress={movingCreature ? moveToCompatibleTile : undefined}
            onDecorationRemove={removeDecoration}
            onTransformChange={(transform) => {
              gardenTransform.current = transform;
            }}
          />
        </View>
      </View>

      <View style={[styles.compactHud, { top: Math.max(insets.top, 6), left: Math.max(insets.left, 8) }]}>
        <Pressable onPress={() => navigation.navigate('Map')} style={styles.hudButton}>
          <Text style={styles.hudIcon}>‹</Text>
        </Pressable>
        <View style={styles.hudStat}>
          <Text style={styles.hudEmoji}>🌱</Text>
          <Text style={styles.hudNumber}>{level}</Text>
        </View>
        <View style={styles.hudDivider} />
        <View style={styles.hudStat}>
          <Text style={styles.hudEmoji}>📚</Text>
          <Text style={styles.hudNumber}>{discoveredCount}</Text>
        </View>
        <View style={styles.hudDivider} />
        <Pressable onPress={() => navigation.navigate('Settings')} style={styles.hudButton}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      <Animated.View pointerEvents="none" style={[styles.intro, { opacity: introOpacity }]}>
        <Text style={styles.introTitle}>나의 생태 정원</Text>
        <Text style={styles.introSubtitle}>발견하고, 열고, 직접 채워보세요</Text>
      </Animated.View>

      <CreatureTray
        creatures={trayCreatures}
        decorations={decorationInventory}
        onCreatureDragStart={onCreatureDragStart}
        onDecorationDragStart={onDecorationDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />

      {/* CreatureTray보다 뒤에 그려야 한다 — 배너의 bottom:180이 트레이 영역과 겹쳐서,
          먼저 그리면 트레이의 불투명 배경에 가려 안 보인다(실기기 테스트로 발견). */}
      {warn && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>{warn}</Text>
        </View>
      )}

      {/* 드래그 고스트 */}
      {(draggingCreature || draggingDecoration) && dragPos && (
        <View pointerEvents="none" style={[styles.ghost, { left: dragPos.x - 24, top: dragPos.y - 24 }]}>
          {draggingCreature ? (
            <GardenCreatureArt speciesId={draggingCreature.species_id} size={46} />
          ) : (
            <Text style={styles.ghostDecoration}>{draggingDecoration?.icon}</Text>
          )}
        </View>
      )}

      {movingCreature && !warn && (
        <Pressable style={styles.moveBanner} onPress={() => setMovingCreature(null)}>
          <Text style={styles.moveText}>
            {movingCreature.name}을(를) 옮길 자리를 눌러주세요 · 취소
          </Text>
        </Pressable>
      )}

      <CreatureStatusSheet
        creatureId={selectedId}
        speciesId={selectedPlacement?.species_id ?? null}
        speciesName={selectedCreature?.name ?? null}
        onClose={() => setSelectedId(null)}
        onRemove={removeCreature}
        onMove={startMovingPlacedCreature}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#B8D98B' },
  compactHud: {
    position: 'absolute',
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRadius: 19,
    backgroundColor: 'rgba(255,250,225,0.91)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    elevation: 6,
  },
  hudButton: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudIcon: { fontSize: 27, lineHeight: 29, fontWeight: '900', color: '#4E5A42' },
  settingsIcon: { fontSize: 18 },
  hudStat: {
    minWidth: 43,
    paddingHorizontal: 5,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudEmoji: { fontSize: 15 },
  hudNumber: { fontSize: 13, fontWeight: '900', color: '#5D5339' },
  hudDivider: { width: 1, height: 20, backgroundColor: 'rgba(91,81,53,0.16)' },
  intro: {
    position: 'absolute',
    top: '13%',
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,252,237,0.91)',
    elevation: 5,
  },
  introTitle: { fontSize: 19, fontWeight: '900', color: '#3F553B' },
  introSubtitle: { marginTop: 2, fontSize: 10, fontWeight: '700', color: '#718067' },
  gridArea: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  gridFrame: {
    flex: 1,
    width: '100%',
    borderWidth: 0,
    backgroundColor: '#B8D98B',
  },
  warnBanner: {
    position: 'absolute',
    bottom: 94,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  warnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  moveBanner: {
    position: 'absolute',
    bottom: 94,
    alignSelf: 'center',
    backgroundColor: 'rgba(57,92,45,0.88)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  moveText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ghost: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  ghostDecoration: { fontSize: 35 },
});
