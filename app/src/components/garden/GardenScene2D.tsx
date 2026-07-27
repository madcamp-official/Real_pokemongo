import { forwardRef, useEffect, useMemo, useRef } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { GardenTile, Placement, TaxonGroup } from '@/types/api';
import {
  GardenCreatureArt,
  hasWingedInsectArt,
} from '@/components/garden/GardenCreatureArt';
import { DecorationArt } from '@/components/garden/DecorationArt';
import {
  DECORATIONS,
  type DecorationPlacement,
} from '@/components/garden/gardenDecorations';
import { gardenPointPercent } from '@/theme/garden';

const GARDEN_BACKGROUND = require('../../../assets/garden/garden-starter-world-v1.png');

// 나무·관목은 정원의 지형을 이루는 오브젝트이므로 일반 초화류보다 크게 보인다.
// DB 응답의 taxon- 접두사 유무와 상관없이 판별한다.
const TREE_SPECIES = new Set([
  'toxicodendron-vernicifluum',
  'lindera-obtusiloba',
  'quercus-mongolica',
  'pinus-densiflora',
  'zanthoxylum-schinifolium',
  'neillia-incisa',
  'quercus-variabilis',
  'callicarpa-japonica',
  'ligustrum-obtusifolium',
]);

function isTreeSpecies(speciesId: string): boolean {
  return TREE_SPECIES.has(speciesId.replace(/^(taxon-|sp_)/, '').replace(/_/g, '-'));
}

export const GARDEN_WORLD_WIDTH = 1400;
export const GARDEN_WORLD_HEIGHT = 596;

export interface GardenTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

export interface GardenCreatureMeta {
  creatureId: string;
  speciesId: string;
  group: TaxonGroup;
}

interface Props {
  tiles: GardenTile[];
  placements: Placement[];
  decorations: DecorationPlacement[];
  creatures: GardenCreatureMeta[];
  level: number;
  isDragging: boolean;
  compatibleTiles: Set<string>;
  onCreaturePress: (creatureId: string) => void;
  onCreatureMoveStart: (creatureId: string) => void;
  onCompatibleTilePress?: (row: number, col: number) => void;
  onDecorationRemove: (id: string) => void;
  onTransformChange: (transform: GardenTransform) => void;
}

/**
 * 화면보다 큰 2D 정원 월드. 배경과 배치 레이어 전체를 pan/pinch-zoom하며,
 * 동식물·장식은 배경 이미지와 분리된 사용자 배치 엔티티다.
 */
export const GardenScene2D = forwardRef<View, Props>(function GardenScene2D(
  {
    tiles,
    placements,
    decorations,
    creatures,
    level,
    isDragging,
    compatibleTiles,
    onCreaturePress,
    onCreatureMoveStart,
    onCompatibleTilePress,
    onDecorationRemove,
    onTransformChange,
  },
  ref
) {
  const metaById = useMemo(
    () => new Map(creatures.map((creature) => [creature.creatureId, creature])),
    [creatures]
  );

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(0.82);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(0.82);
  const viewportWidth = useSharedValue(1);
  const viewportHeight = useSharedValue(1);
  const didInitialize = useRef(false);

  const reportTransform = (x: number, y: number, nextScale: number) =>
    onTransformChange({ translateX: x, translateY: y, scale: nextScale });

  const clampX = (x: number, nextScale: number) => {
    'worklet';
    const min = Math.min(0, viewportWidth.value - GARDEN_WORLD_WIDTH * nextScale);
    return Math.max(min, Math.min(0, x));
  };
  const clampY = (y: number, nextScale: number) => {
    'worklet';
    const min = Math.min(0, viewportHeight.value - GARDEN_WORLD_HEIGHT * nextScale);
    return Math.max(min, Math.min(0, y));
  };

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      startX.value = translateX.value;
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = clampX(startX.value + event.translationX, scale.value);
      translateY.value = clampY(startY.value + event.translationY, scale.value);
    })
    .onEnd(() => {
      runOnJS(reportTransform)(translateX.value, translateY.value, scale.value);
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      const fitScale = Math.max(
        viewportWidth.value / GARDEN_WORLD_WIDTH,
        viewportHeight.value / GARDEN_WORLD_HEIGHT
      );
      const nextScale = Math.max(fitScale, Math.min(1.65, startScale.value * event.scale));
      scale.value = nextScale;
      translateX.value = clampX(translateX.value, nextScale);
      translateY.value = clampY(translateY.value, nextScale);
    })
    .onEnd(() => {
      runOnJS(reportTransform)(translateX.value, translateY.value, scale.value);
    });

  const worldStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewportWidth.value = width;
    viewportHeight.value = height;
    if (didInitialize.current) return;
    didInitialize.current = true;
    const initialScale = Math.max(0.82, width / GARDEN_WORLD_WIDTH, height / GARDEN_WORLD_HEIGHT);
    const initialX = (width - GARDEN_WORLD_WIDTH * initialScale) / 2;
    const initialY = (height - GARDEN_WORLD_HEIGHT * initialScale) / 2;
    scale.value = initialScale;
    translateX.value = initialX;
    translateY.value = initialY;
    reportTransform(initialX, initialY, initialScale);
  };

  return (
    <View ref={ref} collapsable={false} style={styles.viewport} onLayout={handleLayout}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
        <Animated.View style={[styles.world, worldStyle]}>
          <Image source={GARDEN_BACKGROUND} resizeMode="stretch" style={styles.background} />

          {isDragging &&
            tiles.map((tile) => {
              const key = `${tile.row},${tile.col}`;
              if (!compatibleTiles.has(key)) return null;
              const point = gardenPointPercent(tile.row, tile.col);
              const left = `${point.x}%` as `${number}%`;
              const top = `${point.y}%` as `${number}%`;
              return onCompatibleTilePress ? (
                <Pressable
                  key={key}
                  onPress={() => onCompatibleTilePress(tile.row, tile.col)}
                  accessibilityRole="button"
                  accessibilityLabel="이 위치로 옮기기"
                  style={({ pressed }) => [
                    styles.dropTarget,
                    { left, top },
                    pressed && styles.dropTargetPressed,
                  ]}
                />
              ) : (
                <View
                  key={key}
                  pointerEvents="none"
                  style={[styles.dropTarget, { left, top }]}
                />
              );
            })}

          {decorations.map((placement) => {
            const definition = DECORATIONS.find((item) => item.id === placement.decorationId);
            if (!definition) return null;
            return (
              <Pressable
                key={placement.id}
                onLongPress={() => onDecorationRemove(placement.id)}
                accessibilityLabel={`${definition.name}, 길게 눌러 치우기`}
                style={[
                  styles.decoration,
                  {
                    left: `${placement.x}%`,
                    top: `${placement.y}%`,
                    width: definition.width,
                    height: definition.height,
                    marginLeft: -definition.width / 2,
                    marginTop: -definition.height,
                  },
                ]}
              >
                <DecorationArt
                  id={definition.id}
                  width={definition.width}
                  height={definition.height}
                />
              </Pressable>
            );
          })}

          {placements.map((placement) => {
            const meta = metaById.get(placement.creature_id);
            if (!meta) return null;
            const point = gardenPointPercent(placement.row, placement.col);
            return (
              <GardenSprite
                key={placement.creature_id}
                creatureId={placement.creature_id}
                speciesId={placement.species_id}
                group={meta.group}
                left={`${point.x}%`}
                top={`${point.y}%`}
                onPress={onCreaturePress}
                onMoveStart={onCreatureMoveStart}
              />
            );
          })}

          {level < 3 && <LockedZone side="left" requiredLevel={3} />}
          {level < 5 && <LockedZone side="right" requiredLevel={5} />}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

function LockedZone({ side, requiredLevel }: { side: 'left' | 'right'; requiredLevel: number }) {
  return (
    <View pointerEvents="none" style={[styles.lockedZone, side === 'left' ? styles.lockedLeft : styles.lockedRight]}>
      <View style={styles.lockBadge}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockText}>Lv.{requiredLevel}</Text>
      </View>
    </View>
  );
}

function GardenSprite({
  creatureId,
  speciesId,
  group,
  left,
  top,
  onPress,
  onMoveStart,
}: {
  creatureId: string;
  speciesId: string;
  group: TaxonGroup;
  left: `${number}%`;
  top: `${number}%`;
  onPress: (creatureId: string) => void;
  onMoveStart: (creatureId: string) => void;
}) {
  const motion = useRef(new RNAnimated.Value(0)).current;
  const flight = useRef(new RNAnimated.ValueXY({ x: 0, y: 0 })).current;
  const delay = useMemo(
    () => [...creatureId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1500,
    [creatureId]
  );
  const isPlant = group === '식물';
  const isInsect = group === '곤충';
  const isTree = isTreeSpecies(speciesId);
  const isWingedInsect = isInsect && hasWingedInsectArt(speciesId);
  const artSize = isTree ? 178 : isPlant ? 78 : group === '조류' ? 74 : isInsect ? 48 : 62;
  const motionDuration = isPlant ? 2100 : isInsect ? 1650 : 2900;
  const anchorWidth = isTree ? 190 : 100;
  const anchorHeight = isTree ? 190 : 102;
  const flightPath = useMemo(() => {
    const seed = [...creatureId].reduce(
      (value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619),
      2166136261
    );
    const unit = (offset: number) => {
      const mixed = Math.imul(seed ^ (offset * 374761393), 668265263);
      return ((mixed ^ (mixed >>> 13)) >>> 0) / 4294967295;
    };
    const direction = unit(1) > 0.5 ? 1 : -1;
    return [
      {
        x: direction * (62 + unit(2) * 38),
        y: -(20 + unit(3) * 28),
        duration: 3000 + unit(4) * 1600,
      },
      {
        x: -direction * (45 + unit(5) * 40),
        y: 10 + unit(6) * 26,
        duration: 3600 + unit(7) * 1800,
      },
      {
        x: direction * (85 + unit(8) * 45),
        y: -(10 + unit(9) * 34),
        duration: 3400 + unit(10) * 2000,
      },
      {
        x: -direction * (60 + unit(11) * 40),
        y: -(22 + unit(12) * 28),
        duration: 3800 + unit(13) * 1800,
      },
      {
        x: 0,
        y: 0,
        duration: 3400 + unit(14) * 1600,
      },
    ];
  }, [creatureId]);

  useEffect(() => {
    if (isTree) {
      motion.setValue(0);
      flight.setValue({ x: 0, y: 0 });
      return;
    }

    if (isWingedInsect) {
      motion.setValue(0);
      flight.setValue({ x: 0, y: 0 });
      const roam = RNAnimated.loop(
        RNAnimated.sequence(
          flightPath.map((point) =>
            RNAnimated.timing(flight, {
              toValue: { x: point.x, y: point.y },
              duration: point.duration,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            })
          )
        )
      );
      const hover = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(motion, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          RNAnimated.timing(motion, {
            toValue: 0,
            duration: 1900,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      const animation = RNAnimated.sequence([
        RNAnimated.delay(250 + delay),
        RNAnimated.parallel([roam, hover]),
      ]);
      animation.start();
      return () => animation.stop();
    }

    flight.setValue({ x: 0, y: 0 });
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(delay),
        RNAnimated.timing(motion, {
          toValue: 1,
          duration: motionDuration,
          useNativeDriver: true,
        }),
        RNAnimated.timing(motion, {
          toValue: 0,
          duration: motionDuration + (isInsect ? 180 : 0),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [
    delay,
    flight,
    flightPath,
    isPlant,
    isInsect,
    isTree,
    isWingedInsect,
    motion,
    motionDuration,
  ]);

  const transform = isTree
    ? []
    : isWingedInsect
    ? [
        { translateX: flight.x },
        { translateY: flight.y },
        {
          translateY: motion.interpolate({
            inputRange: [0, 1],
            outputRange: [-1.5, 2.5],
          }),
        },
        {
          rotate: motion.interpolate({
            inputRange: [0, 1],
            outputRange: ['-1.2deg', '1.2deg'],
          }),
        },
      ]
    : isPlant
    ? [{ rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] }) }]
    : [
        { translateX: motion.interpolate({ inputRange: [0, 1], outputRange: isInsect ? [-12, 13] : [-7, 8] }) },
        { translateY: motion.interpolate({ inputRange: [0, 0.5, 1], outputRange: isInsect ? [0, -7, 1] : [0, -4, 0] }) },
      ];

  return (
    <RNAnimated.View
      style={[
        styles.spriteAnchor,
        {
          left,
          top,
          width: anchorWidth,
          height: anchorHeight,
          marginLeft: -anchorWidth / 2,
          // 모든 스프라이트의 발밑이 같은 타일 좌표에 오도록 맞춘다.
          marginTop: -anchorHeight + 14,
          transform,
        },
      ]}
    >
      <Pressable
        onPress={() => onPress(creatureId)}
        onLongPress={() => onMoveStart(creatureId)}
        delayLongPress={360}
        accessibilityRole="button"
        accessibilityLabel="정원 친구 정보 보기, 길게 눌러 위치 옮기기"
        style={({ pressed }) => [
          styles.spriteButton,
          pressed && !isTree && styles.spritePressed,
        ]}
      >
        <View style={[styles.spriteShadow, isPlant && styles.plantShadow, isTree && styles.treeShadow]} />
        <GardenCreatureArt speciesId={speciesId} size={artSize} />
      </Pressable>
    </RNAnimated.View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#628842' },
  world: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: GARDEN_WORLD_WIDTH,
    height: GARDEN_WORLD_HEIGHT,
    transformOrigin: 'top left',
  },
  background: {
    position: 'absolute',
    width: GARDEN_WORLD_WIDTH,
    height: GARDEN_WORLD_HEIGHT,
  },
  lockedZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '22%',
    backgroundColor: 'rgba(36,65,48,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedLeft: { left: 0 },
  lockedRight: { right: 0 },
  lockBadge: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,250,225,0.90)',
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },
  lockIcon: { fontSize: 18 },
  lockText: { fontSize: 15, fontWeight: '900', color: '#5D563D' },
  dropTarget: {
    position: 'absolute',
    width: 58,
    height: 30,
    marginLeft: -29,
    marginTop: -15,
    borderRadius: 28,
    backgroundColor: 'rgba(255,240,112,0.42)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,220,0.96)',
  },
  dropTargetPressed: {
    backgroundColor: 'rgba(255,207,64,0.72)',
    transform: [{ scale: 1.12 }],
  },
  decoration: { position: 'absolute', alignItems: 'center', justifyContent: 'flex-end' },
  spriteAnchor: {
    position: 'absolute',
  },
  spriteButton: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  spritePressed: { opacity: 0.75, transform: [{ scale: 0.94 }] },
  spriteShadow: {
    position: 'absolute',
    bottom: 3,
    width: 52,
    height: 14,
    borderRadius: 24,
    backgroundColor: 'rgba(42,63,28,0.25)',
    transform: [{ scaleX: 1.2 }],
  },
  plantShadow: { width: 52, opacity: 0.75 },
  treeShadow: { width: 78, height: 18, opacity: 0.65 },
});
