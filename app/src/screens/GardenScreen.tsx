import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { fetchDex } from '@/api/dex';
import { fetchTileCompatibility } from '@/api/garden';
import { useGardenStore } from '@/store/gardenStore';
import { IsoGrid } from '@/components/garden/IsoGrid';
import { CreatureTray, type OwnedCreature } from '@/components/garden/CreatureTray';
import { CreatureStatusSheet } from '@/components/garden/CreatureStatusSheet';
import { getSpeciesVisual } from '@/theme/species';
import { screenToTile } from '@/theme/garden';
import { colors } from '@/theme/colors';
import { useRewardsStore, isGardenBorderUnlocked } from '@/store/rewardsStore';

/**
 * F16 홈 가든 (2D). isometric 6×6 격자에 개체를 드래그 배치.
 * 3D 개체는 Phase 7에서 이 화면의 마커를 three.js 컴포넌트로 교체 예정.
 */
export default function GardenScreen() {
  const insets = useSafeAreaInsets();

  const tiles = useGardenStore((s) => s.tiles);
  const placements = useGardenStore((s) => s.placements);
  const nicknames = useGardenStore((s) => s.nicknames);
  const loadFromServer = useGardenStore((s) => s.loadFromServer);
  const placeCreature = useGardenStore((s) => s.placeCreature);
  const removeCreature = useGardenStore((s) => s.removeCreature);

  const dexQuery = useQuery({ queryKey: ['dex'], queryFn: fetchDex });
  const compatQuery = useQuery({ queryKey: ['tile-compat'], queryFn: fetchTileCompatibility });

  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  // 보유 개체(발견된 종의 creature) 목록 + 이름 매핑.
  const dexNickname = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of dexQuery.data ?? []) {
      for (const cr of e.creatures) if (cr.nickname) m.set(cr.id, cr.nickname);
    }
    return m;
  }, [dexQuery.data]);

  const nicknameOf = (creatureId: string): string | null =>
    nicknames[creatureId] ?? dexNickname.get(creatureId) ?? null;

  const owned: OwnedCreature[] = useMemo(() => {
    const list: OwnedCreature[] = [];
    for (const e of dexQuery.data ?? []) {
      if (!e.discovered) continue;
      for (const cr of e.creatures) {
        list.push({
          id: cr.id,
          species_id: e.species_id,
          name: e.name,
          group: e.group,
          displayName: nicknames[cr.id] ?? cr.nickname ?? e.name,
        });
      }
    }
    return list;
  }, [dexQuery.data, nicknames]);

  const placedIds = useMemo(() => new Set(placements.map((p) => p.creature_id)), [placements]);
  const trayCreatures = owned.filter((c) => !placedIds.has(c.id));

  // ── 드래그 상태 ──────────────────────────────────────────────
  const rootRef = useRef<View>(null);
  const gridRef = useRef<View>(null);
  const rootOrigin = useRef({ x: 0, y: 0 });
  const gridOrigin = useRef({ x: 0, y: 0 });

  const [dragging, setDragging] = useState<OwnedCreature | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const compatibleTiles = useMemo(() => {
    const set = new Set<string>();
    if (!dragging) return set;
    const allowed = compatQuery.data?.[dragging.group] ?? [];
    for (const t of tiles) if (allowed.includes(t.type)) set.add(`${t.row},${t.col}`);
    return set;
  }, [dragging, compatQuery.data, tiles]);

  const flashWarn = (msg: string) => {
    setWarn(msg);
    setTimeout(() => setWarn(null), 1400);
  };

  const onDragStart = (c: OwnedCreature) => {
    setDragging(c);
    rootRef.current?.measureInWindow((x, y) => (rootOrigin.current = { x, y }));
    gridRef.current?.measureInWindow((x, y) => (gridOrigin.current = { x, y }));
  };
  const onDragMove = (pageX: number, pageY: number) =>
    setDragPos({ x: pageX - rootOrigin.current.x, y: pageY - rootOrigin.current.y });

  const onDragEnd = (pageX: number, pageY: number) => {
    const c = dragging;
    setDragging(null);
    setDragPos(null);
    if (!c) return;

    const tile = screenToTile(pageX - gridOrigin.current.x, pageY - gridOrigin.current.y);
    if (!tile) return;

    const tileObj = tiles.find((t) => t.row === tile.row && t.col === tile.col);
    const allowed = compatQuery.data?.[c.group] ?? [];
    if (!tileObj || !allowed.includes(tileObj.type)) {
      flashWarn(`${c.displayName}은(는) 이 타일에 갈 수 없어요`);
      return;
    }
    const ok = placeCreature({
      creature_id: c.id,
      species_id: c.species_id,
      row: tile.row,
      col: tile.col,
    });
    if (!ok) flashWarn('이미 친구가 있는 자리예요');
  };

  // ── 상태 시트 ────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPlacement = placements.find((p) => p.creature_id === selectedId) ?? null;

  // ── 시간대 인사 ──────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting =
    hour < 6 ? '고요한 새벽이에요' : hour < 12 ? '좋은 아침이에요' : hour < 18 ? '따뜻한 오후예요' : '포근한 저녁이에요';

  const draggingVisual = dragging ? getSpeciesVisual(dragging.species_id) : null;

  // F8 레벨업 언락: 일정 레벨 이상이면 정원 그리드에 반짝이는 테두리 장식.
  const level = useRewardsStore((s) => s.level);
  const borderUnlocked = isGardenBorderUnlocked(level);

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>홈 가든</Text>
        <Text style={styles.greeting}>{greeting}</Text>
      </View>

      <View style={styles.gridArea}>
        <View style={[styles.gridFrame, borderUnlocked && styles.gridFrameUnlocked]}>
          <IsoGrid
            ref={gridRef}
            tiles={tiles}
            placements={placements}
            isDragging={!!dragging}
            compatibleTiles={compatibleTiles}
            onCreaturePress={setSelectedId}
          />
        </View>
      </View>

      <CreatureTray
        creatures={trayCreatures}
        onDragStart={onDragStart}
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
      {dragging && dragPos && draggingVisual && (
        <View pointerEvents="none" style={[styles.ghost, { left: dragPos.x - 24, top: dragPos.y - 24 }]}>
          <Text style={styles.ghostEmoji}>{draggingVisual.emoji}</Text>
        </View>
      )}

      <CreatureStatusSheet
        creatureId={selectedId}
        speciesId={selectedPlacement?.species_id ?? null}
        currentName={selectedId ? nicknameOf(selectedId) : null}
        onClose={() => setSelectedId(null)}
        onRemove={removeCreature}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary },
  greeting: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  gridArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridFrame: { borderRadius: 24, padding: 6, borderWidth: 3, borderColor: 'transparent' },
  gridFrameUnlocked: {
    borderColor: colors.funFactAccent,
    backgroundColor: 'rgba(224, 169, 62, 0.08)',
  },
  warnBanner: {
    position: 'absolute',
    bottom: 180,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  warnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  ghost: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  ghostEmoji: { fontSize: 34 },
});
