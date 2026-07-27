import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import type { QuizQuestion as QuizQuestionType } from '@/types/api';

/**
 * 종 카드 퀴즈 1문항 (F6). 선택 전엔 중립, 선택 후엔 정답/오답 색으로 피드백만 주고
 * 다시 고를 수 있게 잠그지 않는다(아이가 눌러보며 배우는 걸 막지 않기 위함).
 */
interface Props {
  question: QuizQuestionType;
}

export function QuizQuestion({ question }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{question.q}</Text>
      <View style={styles.options}>
        {question.options.map((option, index) => {
          const isSelected = selected === index;
          const isCorrect = index === question.answerIndex;
          const showFeedback = selected !== null;
          return (
            <Pressable
              key={option}
              style={[
                styles.option,
                showFeedback && isCorrect && styles.optionCorrect,
                showFeedback && isSelected && !isCorrect && styles.optionWrong,
              ]}
              onPress={() => setSelected(index)}
            >
              <Text
                style={[
                  styles.optionText,
                  showFeedback && isCorrect && styles.optionTextCorrect,
                  showFeedback && isSelected && !isCorrect && styles.optionTextWrong,
                ]}
              >
                {option}
              </Text>
              {showFeedback && isCorrect && <Text style={styles.mark}>✓</Text>}
              {showFeedback && isSelected && !isCorrect && <Text style={styles.mark}>✗</Text>}
            </Pressable>
          );
        })}
      </View>
      {selected !== null && (
        <Text style={styles.feedback}>
          {selected === question.answerIndex ? '정답이에요! 🎉' : '다시 한번 살펴볼까요?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  question: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  optionCorrect: { backgroundColor: colors.safeBg },
  optionWrong: { backgroundColor: colors.dangerBg },
  optionText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  optionTextCorrect: { color: colors.safeText },
  optionTextWrong: { color: colors.dangerText },
  mark: { fontSize: 16, fontWeight: '800' },
  feedback: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
});
