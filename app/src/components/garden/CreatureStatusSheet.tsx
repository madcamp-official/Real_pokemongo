import { useState } from 'react';
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
import { fetchCreatureStatus, nameCreature } from '@/api/garden';
import { useGardenStore } from '@/store/gardenStore';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { BondGauge } from '@/components/garden/BondGauge';

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

  const { data: status, isLoading } = useQuery({
    queryKey: ['creature-status', creatureId],
    queryFn: () => fetchCreatureStatus(creatureId as string),
    enabled: visible,
  });

  const visual = speciesId ? getSpeciesVisual(speciesId) : null;

  const reset = () => {
    setNaming(false);
    setNameInput('');
    setCelebrate(false);
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

  const displayName = currentName ?? status?.nickname ?? null;

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
            <View style={styles.header}>
              {visual && (
                <View style={[styles.thumb, { backgroundColor: getPastel(visual.pastel) }]}>
                  <Text style={styles.thumbEmoji}>{visual.emoji}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{displayName ?? '이름을 지어주세요'}</Text>
                <Text style={styles.days}>함께한 지 {status.days_together}일째</Text>
              </View>
            </View>

            <BondGauge value={status.bond} max={status.bond_max} />

            <View style={styles.statusBox}>
              <Text style={styles.statusMessage}>💬 {status.status_message}</Text>
            </View>

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
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 34 },
  name: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  days: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  statusMessage: { fontSize: 15, color: colors.textPrimary, lineHeight: 21 },
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
