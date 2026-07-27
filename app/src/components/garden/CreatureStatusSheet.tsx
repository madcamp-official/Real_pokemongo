import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchCreatureStatus, nameCreature, interactWithCreature } from '@/api/garden';
import { queryClient } from '@/api/queryClient';
import { useGardenStore } from '@/store/gardenStore';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { CreatureArt } from '@/components/species/CreatureArt';
import { BondGauge } from '@/components/garden/BondGauge';
import type { CreatureStatus } from '@/types/api';

interface Props {
  creatureId: string | null;
  speciesId: string | null;
  /** 도감/작명 기준 현재 표시 이름(없으면 미작명). */
  currentName: string | null;
  onClose: () => void;
  onRemove: (creatureId: string) => void;
}

/**
 * 배치된 개체 상태 카드 바텀시트 (F16).
 * 이름/함께한 일수/Bond 게이지/오늘의 상태 문구. 미작명 개체는 작명식 진행.
 */
export function CreatureStatusSheet({
  creatureId,
  speciesId,
  currentName,
  onClose,
  onRemove,
}: Props) {
  const visible = !!creatureId && !!speciesId;
  const setNickname = useGardenStore((s) => s.setNickname);

  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [showReunion, setShowReunion] = useState(false);
  const [bondLeveledUp, setBondLeveledUp] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['creature-status', creatureId],
    queryFn: () => fetchCreatureStatus(creatureId as string),
    enabled: visible,
  });

  // 시트가 열릴 때(개체 전환 포함) 재회 여부를 한 번만 반영.
  useEffect(() => {
    if (status?.is_reunion) setShowReunion(true);
  }, [creatureId, status?.is_reunion]);

  const visual = speciesId ? getSpeciesVisual(speciesId) : null;

  const reset = () => {
    setNaming(false);
    setNameInput('');
    setCelebrate(false);
    setReaction(null);
    setShowReunion(false);
    setBondLeveledUp(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitName = async () => {
    const name = nameInput.trim();
    if (!name || !creatureId || submitting) return;
    setSubmitting(true);
    try {
      await nameCreature(creatureId, name);
      setNickname(creatureId, name);
      setCelebrate(true);
      setNaming(false);
    } catch {
      // 실패 시 입력 유지 — 재시도 가능
    } finally {
      setSubmitting(false);
    }
  };

  const onInteract = async () => {
    if (!creatureId || interacting) return;
    setInteracting(true);
    setShowReunion(false);
    try {
      const res = await interactWithCreature(creatureId);
      queryClient.setQueryData<CreatureStatus>(['creature-status', creatureId], (prev) =>
        prev
          ? { ...prev, bond: res.bond, bond_max: res.bond_max, is_reunion: false }
          : prev
      );
      setReaction(res.reaction_message);
      setBondLeveledUp(res.bond_leveled_up);
      setTimeout(() => setReaction(null), 2200);
    } catch {
      // 상호작용 실패는 조용히 무시 — 다시 눌러 재시도 가능
    } finally {
      setInteracting(false);
    }
  };

  const displayName = currentName ?? status?.nickname ?? null;
  const isBestFriend = !!status && status.bond >= status.bond_max;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

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
                    <CreatureArt speciesId={speciesId as string} size={48} />
                  </View>
                  {isBestFriend && (
                    <View style={styles.bestFriendBadge}>
                      <Text style={styles.bestFriendBadgeText}>⭐</Text>
                    </View>
                  )}
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{displayName ?? '이름을 지어주세요'}</Text>
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

            {celebrate && (
              <View style={styles.celebrate}>
                <Text style={styles.celebrateText}>✨ {displayName} (이)라는 이름이 생겼어요!</Text>
              </View>
            )}

            {!displayName && !naming && !celebrate && (
              <Pressable style={styles.primaryBtn} onPress={() => setNaming(true)}>
                <Text style={styles.primaryBtnText}>이름 지어주기</Text>
              </Pressable>
            )}

            {naming && (
              <View style={styles.namingRow}>
                <TextInput
                  style={styles.input}
                  placeholder="이름 (최대 8자)"
                  placeholderTextColor={colors.textMuted}
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={8}
                  autoFocus
                />
                <Pressable
                  style={[styles.confirmBtn, (!nameInput.trim() || submitting) && styles.disabled]}
                  onPress={() => void submitName()}
                  disabled={!nameInput.trim() || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>확정</Text>
                  )}
                </Pressable>
              </View>
            )}

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
      </View>
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
    paddingBottom: 36,
    gap: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 4,
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
  thumbWrap: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 34 },
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
  bondLevelUpText: { fontSize: 13, fontWeight: '700', color: colors.funFactAccent, marginTop: -8 },
  statusBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
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
  celebrate: { backgroundColor: colors.funFactBg, borderRadius: 16, padding: 14, alignItems: 'center' },
  celebrateText: { fontSize: 14, fontWeight: '700', color: colors.funFactAccent },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
  namingRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  confirmBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13 },
  confirmBtnText: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  removeBtn: { alignItems: 'center', paddingVertical: 8 },
  removeText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
