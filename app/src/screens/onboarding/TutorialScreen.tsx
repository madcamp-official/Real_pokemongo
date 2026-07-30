import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Tutorial'>;

interface Step {
  emoji: string;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    emoji: '🌱',
    title: '환영해요, 탐험가!',
    desc: '밖에서 만나는 동물과 식물을 사진으로 찍으면\n나만의 도감이 채워져요.',
  },
  {
    emoji: '⚠️',
    title: '위험한 친구는 조심해요',
    desc: '벌이나 독버섯처럼 위험할 수 있는 생물을 찍으면\n안전 안내가 먼저 나와요.',
  },
  {
    emoji: '📸',
    title: '이렇게 촬영해요',
    desc: '아래 화면처럼 생물을 가운데 담고\n큰 버튼을 눌러 찍어봐요.',
  },
];

/**
 * F1 최초 실행 3단계 튜토리얼.
 * 마지막 단계는 실제 카메라 프리뷰를 띄워 체험하게 한다(실제 카메라 연동 데모).
 */
export default function TutorialScreen({ navigation }: Props) {
  const [step, setStep] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const goNext = () => {
    if (isLast) {
      navigation.replace('Choice');
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.skip} onPress={() => navigation.replace('Choice')}>
        <Text style={styles.skipText}>건너뛰기</Text>
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.emoji}>{current.emoji}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.desc}>{current.desc}</Text>

        {isLast && (
          <View style={styles.demoBox}>
            {!permission?.granted ? (
              <Pressable style={styles.demoPermButton} onPress={requestPermission}>
                <Text style={styles.demoPermText}>카메라로 체험해보기</Text>
              </Pressable>
            ) : (
              <CameraView style={styles.demoCamera} facing="back" />
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={styles.nextButton} onPress={goNext}>
          <Text style={styles.nextText}>{isLast ? '시작하기' : '다음'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: 60 },
  skip: { position: 'absolute', top: 56, right: 20, zIndex: 1 },
  skipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  desc: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  demoBox: { marginTop: 28, width: '100%', alignItems: 'center' },
  demoPermButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
  },
  demoPermText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  demoCamera: { width: 220, height: 220, borderRadius: 20, overflow: 'hidden' },
  footer: { padding: 24, gap: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  nextButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
  },
  nextText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
});
