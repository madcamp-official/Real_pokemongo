import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { getSpeciesVisual, getPastel } from '@/theme/species';
import { CreatureArt } from '@/components/species/CreatureArt';
import type { DexEntry } from '@/types/api';

/**
 * 도감 그리드 카드 (F5).
 * 발견된 종: 컬러 원형 썸네일 + 이름.
 * 미발견 종: 회색 실루엣(그림만 가림) + 실제 이름(뭘 찾아야 하는지는 알 수 있게).
 */
interface Props {
  entry: DexEntry;
  onPress: (entry: DexEntry) => void;
}

export function SpeciesGridCard({ entry, onPress }: Props) {
  if (!entry.discovered) {
    return (
      <View style={[styles.card, styles.lockedCard]}>
        <View style={[styles.thumb, styles.lockedThumb]}>
          <Text style={styles.lockedMark}>?</Text>
        </View>
        <Text style={styles.lockedName} numberOfLines={1}>
          {entry.name}
        </Text>
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
        <CreatureArt speciesId={entry.species_id} size={44} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {entry.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  lockedCard: { backgroundColor: colors.lockedCard },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedThumb: { backgroundColor: colors.lockedCircle },
  emoji: { fontSize: 34 },
  lockedMark: { fontSize: 28, fontWeight: '800', color: colors.lockedText },
  name: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  lockedName: { fontSize: 14, fontWeight: '700', color: colors.lockedText },
});
