import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { startGuestSession } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { colors } from '@/theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Choice'>;

/**
 * F1 로그인 / 계정 만들기 / 게스트 3분기.
 * 로그인: 이미 계정이 있는 사용자 → 바로 LoginScreen(동의 절차 없음).
 * 계정 만들기: 순차 동의(카메라·위치 등 이용 동의) → 계정 생성(닉네임/아바타 포함) 흐름.
 * 게스트: 즉시 로컬 세션 시작(촬영 1~2회 임시 저장) → 바로 메인 진입.
 */
export default function ChoiceScreen({ navigation }: Props) {
  const startGuest = useAuthStore((s) => s.startGuest);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [startingGuest, setStartingGuest] = useState(false);

  const onGuest = async () => {
    if (startingGuest) return;
    setStartingGuest(true);
    try {
      // 서버 세션(토큰)을 먼저 받는다 — 토큰이 있어야 도감·지도·업로드가 동작한다.
      // 서버에 못 닿아도 앱에는 들어가게 둔다(로컬 전용 게스트로 강등, 기존 동작 유지).
      let token: string | undefined;
      let user;
      try {
        const session = await startGuestSession();
        token = session.access_token;
        user = session.user;
      } catch {
        // 무시 — 아래에서 토큰 없이 시작한다.
      }
      startGuest(token, user);
      completeOnboarding();
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } finally {
      setStartingGuest(false);
    }
  };

  const onLogin = () => {
    navigation.navigate('Login');
  };

  const onSignup = () => {
    navigation.navigate('Consent', { mode: 'signup' });
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>어떻게 시작할까요?</Text>
        <Text style={styles.desc}>
          이미 계정이 있다면 로그인하세요.{'\n'}
          처음이라면 계정을 만들거나, 우선 게스트로 둘러볼 수 있어요.
        </Text>
      </View>

      <View style={styles.options}>
        <Pressable style={styles.primaryCard} onPress={onLogin}>
          <Text style={styles.primaryEmoji}>🔑</Text>
          <Text style={styles.primaryTitle}>로그인</Text>
          <Text style={styles.primaryDesc}>이미 계정이 있어요</Text>
        </Pressable>

        <Pressable style={styles.secondaryCard} onPress={onSignup}>
          <Text style={styles.secondaryTitle}>계정 만들기</Text>
          <Text style={styles.secondaryDesc}>도감과 기록을 안전하게 보관해요</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryCard}
          onPress={() => void onGuest()}
          disabled={startingGuest}
        >
          {startingGuest ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={styles.secondaryTitle}>게스트로 둘러보기</Text>
              <Text style={styles.secondaryDesc}>
                로그인 없이 촬영 1~2회를 체험할 수 있어요
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center', gap: 40 },
  header: { alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 },
  desc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  options: { gap: 14 },
  primaryCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  primaryEmoji: { fontSize: 32, marginBottom: 8 },
  primaryTitle: { color: colors.onPrimary, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  primaryDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  secondaryCard: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  secondaryDesc: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
});
