import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  askProfessor,
  fetchProfessorGreeting,
  fetchProfessorSuggestions,
} from '@/api/professor';
import { ProfessorAvatar } from '@/components/professor/ProfessorAvatar';
import { colors } from '@/theme/colors';
import type { ProfessorAskResponse, ProfessorSuggestion } from '@/types/api';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Professor'>;

export default function ProfessorScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const contextSpeciesId = route.params?.contextSpeciesId;
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<ProfessorAskResponse | null>(null);

  const greeting = useQuery({
    queryKey: ['professor', 'greeting'],
    queryFn: fetchProfessorGreeting,
  });
  const suggestions = useQuery({
    queryKey: ['professor', 'suggestions'],
    queryFn: fetchProfessorSuggestions,
  });
  const askMutation = useMutation({
    mutationFn: (input: { question: string; contextSpeciesId?: string }) =>
      askProfessor(input.question, input.contextSpeciesId),
    onSuccess: (result) => setAnswer(result),
  });

  const canSubmit = question.trim().length >= 2 && !askMutation.isPending;
  const statusLabel = useMemo(() => {
    if (!answer || answer.confidence === 'unknown') return null;
    if (answer.response_source === 'small_talk') return null;
    if (answer.response_source === 'fixed_safety') return '안전 원칙';
    if (answer.confidence === 'high') return '도감에서 찾은 답';
    return '가장 가까운 도감 내용';
  }, [answer]);

  const submit = (nextQuestion = question, suggestionContext?: string) => {
    const normalized = nextQuestion.trim();
    if (normalized.length < 2 || askMutation.isPending) return;
    setQuestion(normalized);
    setAnswer(null);
    askMutation.reset();
    askMutation.mutate({
      question: normalized,
      contextSpeciesId: suggestionContext ?? contextSpeciesId,
    });
  };

  const selectSuggestion = (suggestion: ProfessorSuggestion) => {
    submit(suggestion.question, suggestion.context_species_id);
  };

  const openSpecies = (speciesId: string) => {
    navigation.push('SpeciesCard', { speciesId });
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로 가기"
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.eyebrow}>NATURE GO</Text>
          <Text style={styles.title}>도감 박사</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 138 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <ProfessorAvatar
            thinking={askMutation.isPending}
            warning={Boolean(answer?.safety_warning)}
          />
          <View style={styles.greetingBubble}>
            <Text style={styles.greetingText}>
              {greeting.data?.message ??
                '도감에 기록된 사실을 찾아 함께 이야기해 줄게요.'}
            </Text>
            <Text style={styles.privacyText}>질문은 대화 기록으로 저장하지 않아요.</Text>
          </View>
        </View>

        {!answer && !askMutation.isPending && (
          <View style={styles.suggestionSection}>
            <Text style={styles.sectionLabel}>이렇게 물어보세요</Text>
            <View style={styles.chipWrap}>
              {(suggestions.data ?? []).map((suggestion) => (
                <Pressable
                  key={suggestion.id}
                  style={styles.chip}
                  onPress={() => selectSuggestion(suggestion)}
                >
                  <Text style={styles.chipText}>{suggestion.question}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {askMutation.isPending && (
          <View style={styles.thinkingCard}>
            <ActivityIndicator color="#4F7D62" />
            <View style={styles.thinkingCopy}>
              <Text style={styles.thinkingTitle}>도감을 찾아보고 있어요</Text>
              <Text style={styles.thinkingText}>검수된 문장 중 가장 가까운 내용을 확인해요.</Text>
            </View>
          </View>
        )}

        {askMutation.isError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>지금은 답을 가져오지 못했어요</Text>
            <Text style={styles.errorText}>연결을 확인한 뒤 같은 질문을 다시 보내 주세요.</Text>
            <Pressable style={styles.retryButton} onPress={() => submit()}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        )}

        {answer && (
          <View style={styles.answerSection}>
            {answer.safety_warning && (
              <View style={styles.safetyCard}>
                <Text style={styles.safetyTitle}>먼저, 안전 약속</Text>
                <Text style={styles.safetyText}>{answer.safety_warning}</Text>
              </View>
            )}

            {!(answer.response_source === 'fixed_safety' && answer.answer === answer.safety_warning) && (
              <View style={styles.answerCard}>
              {statusLabel && <Text style={styles.answerSource}>{statusLabel}</Text>}
              <Text style={styles.answerText}>{answer.answer}</Text>
              {answer.restricted && (
                <Text style={styles.restrictedText}>
                  발견 전에는 이름과 자세한 사실을 알려주지 않아요.
                </Text>
              )}
              {answer.matched_species && !answer.restricted && !answer.matched_species.discovered && (
                <Text style={styles.unregisteredText}>
                  아직 도감 등록 전이에요. 답을 읽어도 도감에는 자동 등록되지 않아요.
                </Text>
              )}
              {answer.matched_species?.discovered && !answer.restricted && (
                <Pressable
                  style={styles.speciesLink}
                  onPress={() => openSpecies(answer.matched_species!.species_id)}
                >
                  <Text style={styles.speciesLinkText}>
                    {answer.matched_species.name} 종 카드 보기
                  </Text>
                  <Text style={styles.speciesLinkArrow}>›</Text>
                </Pressable>
              )}
              </View>
            )}

            {answer.related.length > 0 && (
              <View style={styles.relatedSection}>
                <Text style={styles.sectionLabel}>함께 살펴볼 친구</Text>
                {answer.related.map((related) => (
                  <Pressable
                    key={related.species_id}
                    style={styles.relatedCard}
                    onPress={() => openSpecies(related.species_id)}
                  >
                    <View>
                      <Text style={styles.relatedName}>{related.name}</Text>
                      <Text style={styles.relatedReason}>{related.reason}</Text>
                    </View>
                    <Text style={styles.relatedArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.composer}>
          <TextInput
            ref={inputRef}
            value={question}
            onChangeText={setQuestion}
            placeholder="사는 곳, 크기, 활동 시간을 물어보세요"
            placeholderTextColor="#A99F95"
            style={styles.input}
            maxLength={200}
            multiline
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => submit()}
            editable={!askMutation.isPending}
            accessibilityLabel="도감 박사에게 할 질문"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="질문 보내기"
            disabled={!canSubmit}
            style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
            onPress={() => submit()}
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </View>
        <Text style={styles.counter}>{question.length}/200</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F5EC' },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248,245,236,0.97)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5DED1',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backText: { color: '#284C37', fontSize: 31, fontWeight: '700', marginTop: -4 },
  eyebrow: { color: '#78907D', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#213A2B', fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  headerSpacer: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 22 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  greetingBubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    padding: 16,
    shadowColor: '#24352A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  greetingText: { color: '#304338', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  privacyText: { color: '#9A9188', fontSize: 11, lineHeight: 16, marginTop: 7 },
  suggestionSection: { marginTop: 28 },
  sectionLabel: { color: '#617265', fontSize: 13, fontWeight: '900', marginBottom: 10 },
  chipWrap: { gap: 9 },
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#EDF3E8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5E2CE',
  },
  chipText: { color: '#31533D', fontSize: 14, fontWeight: '700' },
  thinkingCard: {
    marginTop: 26,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  thinkingCopy: { flex: 1 },
  thinkingTitle: { color: '#304338', fontSize: 15, fontWeight: '800' },
  thinkingText: { color: '#8B867D', fontSize: 12, lineHeight: 18, marginTop: 3 },
  errorCard: { marginTop: 24, padding: 18, borderRadius: 20, backgroundColor: '#FCE5DE' },
  errorTitle: { color: '#9D4036', fontSize: 15, fontWeight: '900' },
  errorText: { color: '#9D5A50', fontSize: 13, lineHeight: 19, marginTop: 5 },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryText: { color: '#9D4036', fontSize: 13, fontWeight: '800' },
  answerSection: { marginTop: 25, gap: 12 },
  safetyCard: {
    backgroundColor: '#FCE1D8',
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: '#F3C4B7',
  },
  safetyTitle: { color: '#A24235', fontSize: 13, fontWeight: '900', marginBottom: 6 },
  safetyText: { color: '#743D35', fontSize: 15, lineHeight: 22, fontWeight: '700' },
  answerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 19,
    shadowColor: '#24352A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  answerSource: { color: '#628069', fontSize: 11, fontWeight: '900', marginBottom: 8 },
  answerText: { color: '#2D3931', fontSize: 17, lineHeight: 26, fontWeight: '700' },
  restrictedText: { color: '#92887F', fontSize: 12, lineHeight: 18, marginTop: 12 },
  unregisteredText: { color: '#6F766F', fontSize: 12, lineHeight: 18, marginTop: 12 },
  speciesLink: {
    marginTop: 16,
    backgroundColor: '#EAF2E6',
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speciesLinkText: { color: '#315C42', fontSize: 14, fontWeight: '900' },
  speciesLinkArrow: { color: '#315C42', fontSize: 24, lineHeight: 24 },
  relatedSection: { marginTop: 6 },
  relatedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  relatedName: { color: '#324239', fontSize: 14, fontWeight: '900' },
  relatedReason: { color: '#8A867E', fontSize: 12, marginTop: 3 },
  relatedArrow: { color: '#6A7F70', fontSize: 24 },
  composerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 11,
    backgroundColor: 'rgba(248,245,236,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DFD9CF',
  },
  composer: {
    minHeight: 56,
    maxHeight: 104,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD8CF',
    paddingLeft: 16,
    paddingRight: 7,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 86,
    color: '#2E3932',
    fontSize: 14,
    lineHeight: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3E7456',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#C9CEC7' },
  sendText: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: -2 },
  counter: { color: '#A79F96', fontSize: 10, textAlign: 'right', marginTop: 4, marginRight: 8 },
});
