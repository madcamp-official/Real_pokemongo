import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { signup, convertGuestSession } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;
const AVATARS = ['🦊', '🐰', '🐢', '🐿️', '🦔', '🐝'];

/**
 * F1 계정 만들기 (단일 사용자 모델).
 * 이메일/비밀번호 + 닉네임/아바타를 한 화면에서 받아 계정을 생성한다.
 * route.params.consent는 이전 화면(ConsentScreen)에서 이미 수집된 동의 값 —
 * 계정이 없던 시점엔 인증 토큰이 없어 여기서 가입 요청에 함께 담아 제출한다.
 * mode='convert' 인 경우 가입 직후 게스트 로컬 기록을 서버로 마이그레이션한다.
 */
export default function SignupScreen({ navigation, route }: Props) {
  const { mode, consent } = route.params;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [submitting, setSubmitting] = useState(false);

  const setSession = useAuthStore((s) => s.setSession);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const resetGuestData = useAuthStore((s) => s.resetGuestData);

  const isValid =
    EMAIL_RE.test(email) &&
    password.length >= MIN_PASSWORD_LEN &&
    password === passwordConfirm &&
    nickname.trim().length >= 1 &&
    nickname.trim().length <= 12;

  const onSubmit = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await signup({
        email,
        password,
        nickname: nickname.trim(),
        avatar,
        ...consent,
      });
      setSession(res.access_token, res.user);

      if (mode === 'convert') {
        await convertGuestSession();
        resetGuestData();
      }

      completeOnboarding();
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch {
      Alert.alert('계정 생성 실패', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>계정 만들기</Text>
      <Text style={styles.desc}>
        {mode === 'convert'
          ? '게스트로 체험한 기록을 안전하게 이어가려면 계정이 필요해요.'
          : '도감과 기록을 안전하게 보관할 계정이에요.'}
      </Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor="#A6B39A"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 (8자 이상)"
          placeholderTextColor="#A6B39A"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 확인"
          placeholderTextColor="#A6B39A"
          secureTextEntry
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
        />
        <TextInput
          style={styles.input}
          placeholder="닉네임"
          placeholderTextColor="#A6B39A"
          value={nickname}
          onChangeText={setNickname}
          maxLength={12}
        />
      </View>

      <Text style={styles.sectionLabel}>아바타</Text>
      <View style={styles.avatarRow}>
        {AVATARS.map((a) => (
          <Pressable
            key={a}
            style={[styles.avatarChip, avatar === a && styles.avatarChipActive]}
            onPress={() => setAvatar(a)}
          >
            <Text style={styles.avatarEmoji}>{a}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={[styles.submitButton, (!isValid || submitting) && styles.disabled]}
        onPress={() => void onSubmit()}
        disabled={!isValid || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>
            {mode === 'convert' ? '완료하고 기록 이어가기' : '탐험 시작하기'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, backgroundColor: '#F7F9F4', padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#2E3A24' },
  desc: { fontSize: 14, color: '#6B7A5E', lineHeight: 20, marginBottom: 4 },
  form: { gap: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E4EFD8',
    color: '#2E3A24',
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6B7A5E', marginTop: 4 },
  avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarChip: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E4EFD8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarChipActive: { borderColor: '#5B8C3E', backgroundColor: '#E4EFD8' },
  avatarEmoji: { fontSize: 24 },
  submitButton: {
    marginTop: 12,
    backgroundColor: '#5B8C3E',
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
  },
  disabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
