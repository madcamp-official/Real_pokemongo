import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { GardenCreatureArt } from '@/components/garden/GardenCreatureArt';
import { UnknownSpeciesSilhouette } from '@/components/dex/UnknownSpeciesSilhouette';
import type { DexEntry } from '@/types/api';

/**
 * 도감 그리드 카드 (F5).
 * 발견된 종: 컬러 원형 썸네일 + 이름.
 * 미발견 종: 회색 실루엣(그림만 가림) + 실제 이름(뭘 찾아야 하는지는 알 수 있게).
 */
interface Props {
  entry: DexEntry;
  onPress: (entry: DexEntry) => void;
  index: number;
}

export function SpeciesGridCard({ entry, onPress, index }: Props) {
  if (!entry.discovered) {
    return (
      <View accessibilityLabel="미수집 종" style={[styles.card, styles.lockedCard]}>
        <Text style={styles.catalogNumber}>#{String(index + 1).padStart(3, '0')}</Text>
        <View style={[styles.thumb, styles.lockedThumb]}>
          <UnknownSpeciesSilhouette group={entry.group} size={55} />
        </View>
        <Text style={styles.lockedName}>미발견</Text>
      </View>
    );
  }

  const visual = getSpeciesVisual(entry.species_id);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(entry)}
    >
      <View style={[styles.thumb, { backgroundColor: getPastel(visual.pastel) }]}>
        <GardenCreatureArt speciesId={entry.species_id} size={44} />
      </View>
      <Text style={styles.name}>
        {entry.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 146,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingTop: 13,
    paddingBottom: 15,
    alignItems: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  lockedCard: { backgroundColor: '#F7F5F4' },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedThumb: { backgroundColor: '#ECE9E9' },
  catalogNumber: { height: 16, fontSize: 11, lineHeight: 16, fontWeight: '800', color: '#ABA7A7', includeFontPadding: false },
  name: {
    minHeight: 20,
    paddingHorizontal: 3,
    paddingBottom: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    includeFontPadding: false,
  },
  lockedName: { height: 18, fontSize: 12, lineHeight: 18, fontWeight: '800', color: '#B5B0B0', includeFontPadding: false },
});
