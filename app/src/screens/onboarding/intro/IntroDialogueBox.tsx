import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

interface Props {
  text: string;
  speakerLabel?: string;
  /** 전부 표시된 뒤 자동으로(또는 탭해서) 다음 대사로 넘어갈 때 호출한다. */
  onAdvance: () => void;
  onSkip: () => void;
  showSkip: boolean;
}

const CHAR_INTERVAL_MS = 32;
const MIN_HOLD_MS = 1100;
const MS_PER_CHAR_HOLD = 45;

/**
 * 하단 대사창 — 한 글자씩 나타나는 타자기 효과 + 탭하면 즉시 전체 표시/다음 대사로
 * 진행. 다 표시된 뒤에는 읽는 시간을 계산해 자동으로도 다음 대사로 넘어간다.
 */
export function IntroDialogueBox({ text, speakerLabel, onAdvance, onSkip, showSkip }: Props) {
  const [revealed, setRevealed] = useState(0);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRevealed(0);
    doneRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (holdRef.current) clearTimeout(holdRef.current);

    timerRef.current = setInterval(() => {
      setRevealed((r) => {
        const next = r + 1;
        if (next >= text.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          doneRef.current = true;
          holdRef.current = setTimeout(
            () => onAdvance(),
            Math.max(MIN_HOLD_MS, text.length * MS_PER_CHAR_HOLD)
          );
        }
        return next;
      });
    }, CHAR_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (holdRef.current) clearTimeout(holdRef.current);
    };
    // text가 바뀔 때만 타자기 애니메이션을 새로 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const handlePress = () => {
    if (!doneRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      doneRef.current = true;
      setRevealed(text.length);
      holdRef.current = setTimeout(
        () => onAdvance(),
        Math.max(MIN_HOLD_MS, text.length * MS_PER_CHAR_HOLD)
      );
      return;
    }
    if (holdRef.current) clearTimeout(holdRef.current);
    onAdvance();
  };

  return (
    <View style={styles.wrap}>
      {showSkip && (
        <Pressable style={styles.skip} onPress={onSkip} hitSlop={10}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
      )}
      <Pressable style={styles.box} onPress={handlePress}>
        {speakerLabel && (
          <View style={styles.speakerPill}>
            <Text style={styles.speakerText}>{speakerLabel}</Text>
          </View>
        )}
        <Text style={styles.text}>{text.slice(0, revealed)}</Text>
        <Text style={styles.chevron}>{doneRef.current ? '▼' : ' '}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingBottom: 28 },
  skip: { position: 'absolute', top: -44, right: 18 },
  skipText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700' },
  box: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    minHeight: 96,
    shadowColor: '#1B2A22',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  speakerPill: {
    position: 'absolute',
    top: -16,
    left: 18,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  speakerText: { color: colors.onPrimary, fontSize: 13, fontWeight: '800' },
  text: { fontSize: 16, color: colors.textPrimary, lineHeight: 24, fontWeight: '600' },
  chevron: { textAlign: 'right', color: colors.textSecondary, marginTop: 6, fontSize: 12 },
});
