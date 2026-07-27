import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { fetchSpeciesCard } from '@/api/species';
import { CreatureArt } from '@/components/species/CreatureArt';
import { colors } from '@/theme/colors';
import type { MapPin } from '@/types/api';

const INK = '#201E1D';

/** 분류군별 태그 색 — 지도 핀 헤더와 같은 팔레트. */
const GROUP_TAG: Record<string, { bg: string; fg: string }> = {
  곤충: { bg: '#FBDCD5', fg: '#8A3226' },
  양서류: { bg: '#D5ECF8', fg: '#124A63' },
  식물: { bg: '#DFF0C8', fg: '#2F5312' },
  기타: { bg: '#EDE7E0', fg: '#5A4F47' },
};

interface Props {
  pin: MapPin | null;
  onClose: () => void;
  onOpenCard: (speciesId: string) => void;
}

/**
 * 지도 핀을 눌렀을 때 올라오는 발견 상세 시트 (F11 → F6 연결).
 * 종 카드(F6)의 핵심만 미리 보여주고, 전체는 종 카드 화면으로 넘긴다.
 * 위험 생물이면 안전 수칙을 가장 먼저·가장 눈에 띄게 보여준다(F4 원칙).
 */
export function PinDetailSheet({ pin, onClose, onOpenCard }: Props) {
  const insets = useSafeAreaInsets();
  const visible = !!pin;

  const cardQuery = useQuery({
    queryKey: ['species-card', pin?.species_id],
    queryFn: () => fetchSpeciesCard(pin?.species_id as string),
    enabled: visible,
  });

  const card = cardQuery.data;
  const tag = pin ? GROUP_TAG[pin.group] ?? GROUP_TAG.기타 : GROUP_TAG.기타;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
        <View style={styles.handle} />
        <Pressable style={styles.close} onPress={onClose} accessibilityLabel="닫기">
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.thumb}>
              {pin && <CreatureArt speciesId={pin.species_id} size={62} />}
            </View>
            <View style={styles.headerText}>
              <View style={[styles.tag, { backgroundColor: tag.bg }]}>
                <Text style={[styles.tagText, { color: tag.fg }]}>
                  {pin?.is_dangerous ? '위험' : pin?.group}
                </Text>
              </View>
              <Text style={styles.name}>{pin?.species_name}</Text>
              {card && <Text style={styles.latin}>{card.scientific_name} · 야생 개체</Text>}
            </View>
          </View>

          {/* 위험 생물이면 안전 수칙을 최상단에 고정 노출 */}
          {card?.is_dangerous && card.safety_notes && (
            <View style={styles.safety}>
              <Text style={styles.safetyTitle}>⚠️ 안전 수칙 · 위험 생물</Text>
              <Text style={styles.safetyBody}>{card.safety_notes}</Text>
            </View>
          )}

          {cardQuery.isLoading && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}

          {card && (
            <>
              <View style={styles.rows}>
                <Row label="서식지" value={card.habitat} />
                <Row label="크기" value={card.size} />
                <Row label="활동 시간대" value={card.active_time} />
                <Row label="희귀도" value={card.rarity} />
              </View>

              <Text style={styles.sectionLabel}>재미있는 사실</Text>
              <Text style={styles.sectionBody}>{card.fun_fact}</Text>
            </>
          )}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => pin && onOpenCard(pin.species_id)}
          >
            <Text style={styles.primaryBtnText}>종 카드 전체 보기</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,18,16,0.32)' },
  sheet: {
    maxHeight: '76%',
    backgroundColor: '#F3F2F2',
    borderTopWidth: 3,
    borderTopColor: INK,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  handle: { width: 44, height: 4, backgroundColor: '#C9C7C1', alignSelf: 'center', marginBottom: 14 },
  close: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 34,
    height: 34,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  closeIcon: { fontSize: 15, fontWeight: '800', color: INK },

  header: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingRight: 40 },
  thumb: {
    width: 96,
    height: 96,
    backgroundColor: '#E7E6E1',
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderColor: INK,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  tagText: { fontSize: 11, fontWeight: '800' },
  name: { fontSize: 24, fontWeight: '900', color: INK, letterSpacing: -0.5, lineHeight: 27 },
  latin: { fontSize: 13, color: '#6B6862', marginTop: 3 },

  safety: {
    marginTop: 14,
    backgroundColor: colors.dangerText,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  safetyTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  safetyBody: { color: '#fff', fontSize: 13, lineHeight: 19 },

  loading: { paddingVertical: 28, alignItems: 'center' },

  rows: { marginTop: 16, borderTopWidth: 2, borderTopColor: INK },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#D6D4CE',
    gap: 12,
  },
  rowLabel: { fontSize: 14, color: '#6B6862', fontWeight: '600' },
  rowValue: { fontSize: 14, fontWeight: '700', color: INK, flexShrink: 1, textAlign: 'right' },

  sectionLabel: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.primary,
    marginBottom: 5,
  },
  sectionBody: { fontSize: 14, lineHeight: 21, color: INK },

  primaryBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.85 },
});
