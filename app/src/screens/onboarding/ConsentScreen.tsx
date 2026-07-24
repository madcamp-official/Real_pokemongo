import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { submitConsent } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Consent'>;

const CONSENT_VERSION = '2026-07-24-v1';

type ConsentKey = 'privacy' | 'location' | 'photo';

interface ConsentStep {
  key: ConsentKey;
  emoji: string;
  title: string;
  desc: string;
}

const STEPS: ConsentStep[] = [
  {
    key: 'privacy',
    emoji: '🔒',
    title: '개인정보 수집·이용 동의',
    desc: '이메일과 닉네임 등 계정 정보를 서비스 제공 목적으로만 수집해요.',
  },
  {
    key: 'location',
    emoji: '📍',
    title: '위치정보 이용 동의',
    desc: '촬영 위치를 지도 기능에 사용할 수 있어요. 정확한 좌표 대신 흐릿하게 처리되며, 언제든 설정에서 끌 수 있어요.',
  },
  {
    key: 'photo',
    emoji: '📷',
    title: '사진 이용 동의',
    desc: '촬영한 사진은 생물 동정을 위해 서버로 전송·보관돼요. 외부에 공개되지 않아요.',
  },
];

/**
 * F1 순차 동의 화면. privacy → location → photo 순서로 하나씩 보여주고
 * 각 단계의 동의 상태를 로컬에 표시한 뒤, 마지막에 서버에 일괄 제출한다.
 */
export default function ConsentScreen({ navigation, route }: Props) {
  const { mode } = route.params;
  const [stepIndex, setStepIndex] = useState(0);
  const [agreed, setAgreed] = useState<Record<ConsentKey, boolean>>({
    privacy: false,
    location: false,
    photo: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const setConsent = useAuthStore((s) => s.setConsent);
  const initSettingsFromConsent = useSettingsStore((s) => s.initFromConsent);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const onAgree = async () => {
    const next = { ...agreed, [step.key]: true };
    setAgreed(next);

    if (!isLast) {
      setStepIndex((i) => i + 1);
      return;
    }

    setSubmitting(true);
    try {
      await submitConsent({
        privacy: next.privacy,
        location: next.location,
        photo: next.photo,
        consent_version: CONSENT_VERSION,
      });
      setConsent({
        ...next,
        consentVersion: CONSENT_VERSION,
        agreedAt: new Date().toISOString(),
      });
      initSettingsFromConsent({ location: next.location, photo: next.photo });
      navigation.navigate('Signup', { mode });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View
            key={s.key}
            style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]}
          />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.emoji}>{step.emoji}</Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.desc}>{step.desc}</Text>
      </View>

      <Pressable
        style={[styles.agreeButton, submitting && styles.disabled]}
        onPress={() => void onAgree()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.agreeText}>
            {isLast ? '동의하고 계속하기' : '동의합니다'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9F4', padding: 24, justifyContent: 'center', gap: 32 },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  progressDot: { width: 32, height: 6, borderRadius: 3, backgroundColor: '#D7E0CC' },
  progressDotActive: { backgroundColor: '#5B8C3E' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4EFD8',
  },
  emoji: { fontSize: 44, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#2E3A24', marginBottom: 10, textAlign: 'center' },
  desc: { fontSize: 14, color: '#6B7A5E', textAlign: 'center', lineHeight: 21 },
  agreeButton: {
    backgroundColor: '#5B8C3E',
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  agreeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
