import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchCreatureStatus, interactWithCreature } from '@/api/garden';
import { queryClient } from '@/api/queryClient';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { GardenCreatureArt } from '@/components/garden/GardenCreatureArt';
import { BondGauge } from '@/components/garden/BondGauge';
import type { CreatureStatus } from '@/types/api';

interface Props {
  creatureId: string | null;
  speciesId: string | null;
  /** 도감에서 사용하는 종 이름. 개체 별명 대신 항상 이 이름을 표시한다. */
  speciesName: string | null;
  onClose: () => void;
  onRemove: (creatureId: string) => void;
  onMove: (creatureId: string) => void;
}

/** 배치된 개체의 종 이름, 친밀도와 오늘 상태를 보여주는 드래그 닫기 시트. */
export function CreatureStatusSheet({
  creatureId,
  speciesId,
  speciesName,
  onClose,
  onRemove,
  onMove,
}: Props) {
  const visible = !!creatureId && !!speciesId;
  const [interacting, setInteracting] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [showReunion, setShowReunion] = useState(false);
  const [bondLeveledUp, setBondLeveledUp] = useState(false);
  const sheetY = useRef(new Animated.Value(0)).current;
  const handleCloseRef = useRef<() => void>(() => {});

  const { data: status, isLoading } = useQuery({
    queryKey: ['creature-status', creatureId],
    queryFn: () => fetchCreatureStatus(creatureId as string),
    enabled: visible,
  });

  useEffect(() => {
    if (status?.is_reunion) setShowReunion(true);
  }, [creatureId, status?.is_reunion]);

  useEffect(() => {
    if (visible) sheetY.setValue(0);
  }, [sheetY, visible]);

  const visual = speciesId ? getSpeciesVisual(speciesId) : null;

  const reset = () => {
    setReaction(null);
    setShowReunion(false);
    setBondLeveledUp(false);
    sheetY.setValue(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };
  handleCloseRef.current = handleClose;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        sheetY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 72 || gesture.vy > 0.75) {
          Animated.timing(sheetY, {
            toValue: 500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => handleCloseRef.current());
          return;
        }
        Animated.spring(sheetY, {
          toValue: 0,
          damping: 18,
          stiffness: 220,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const onInteract = async () => {
    if (!creatureId || interacting) return;
    setInteracting(true);
    setShowReunion(false);
    try {
      const response = await interactWithCreature(creatureId);
      queryClient.setQueryData<CreatureStatus>(['creature-status', creatureId], (previous) =>
        previous
          ? {
              ...previous,
              bond: response.bond,
              bond_max: response.bond_max,
              is_reunion: false,
            }
          : previous
      );
      setReaction(response.reaction_message);
      setBondLeveledUp(response.bond_leveled_up);
      setTimeout(() => setReaction(null), 2200);
    } catch {
      // 다시 눌러 재시도할 수 있도록 별도 오류 화면은 띄우지 않는다.
    } finally {
      setInteracting(false);
    }
  };

  const isBestFriend = !!status && status.bond >= status.bond_max;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>

        {isLoading || !status ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {showReunion && (
              <View style={styles.reunionBanner}>
                <Text style={styles.reunionText}>💕 오랜만이에요!</Text>
              </View>
            )}

            <View style={styles.header}>
              {visual && (
                <View style={styles.thumbWrap}>
                  <View style={[styles.thumb, { backgroundColor: getPastel(visual.pastel) }]}>
                    <GardenCreatureArt speciesId={speciesId as string} size={56} />
                  </View>
                  {isBestFriend && (
                    <View style={styles.bestFriendBadge}>
                      <Text style={styles.bestFriendBadgeText}>⭐</Text>
                    </View>
                  )}
                </View>
              )}
              <View style={styles.nameColumn}>
                <Text style={styles.name}>{speciesName ?? '정원 친구'}</Text>
                <Text style={styles.days}>함께한 지 {status.days_together}일째</Text>
              </View>
            </View>

            <BondGauge value={status.bond} max={status.bond_max} />
            {bondLeveledUp && <Text style={styles.bondLevelUpText}>✨ 친밀도가 깊어졌어요!</Text>}

            <View style={styles.statusBox}>
              <Text style={styles.statusMessage}>
                {reaction ? `🐾 ${reaction}` : `💬 ${status.status_message}`}
              </Text>
            </View>

            <Pressable
              style={[styles.patBtn, interacting && styles.disabled]}
              onPress={() => void onInteract()}
              disabled={interacting}
            >
              {interacting ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.patBtnText}>🤗 쓰다듬기</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.moveBtn}
              onPress={() => {
                if (creatureId) {
                  reset();
                  onMove(creatureId);
                }
              }}
            >
              <Text style={styles.moveBtnText}>↔ 다른 자리로 옮기기</Text>
            </Pressable>

            <Pressable
              style={styles.removeBtn}
              onPress={() => {
                if (creatureId) onRemove(creatureId);
                handleClose();
              }}
            >
              <Text style={styles.removeText}>정원에서 치우기</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 30,
    gap: 13,
  },
  dragArea: {
    marginHorizontal: -24,
    marginTop: -18,
    paddingTop: 18,
    paddingBottom: 12,
    alignItems: 'center',
  },
  handle: {
    width: 52,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  reunionBanner: {
    backgroundColor: colors.funFactBg,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reunionText: { fontSize: 14, fontWeight: '800', color: colors.funFactAccent },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameColumn: { flex: 1 },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestFriendBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bestFriendBadgeText: { fontSize: 13 },
  name: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  days: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  bondLevelUpText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.funFactAccent,
    marginTop: -6,
  },
  statusBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusMessage: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
  patBtn: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  patBtnText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  moveBtn: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  moveBtnText: { color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  removeBtn: { alignItems: 'center', paddingVertical: 7 },
  removeText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
