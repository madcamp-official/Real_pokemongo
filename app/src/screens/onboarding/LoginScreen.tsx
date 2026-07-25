import { useRef, useState } from 'react';
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
import { login } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * F1 기존 계정 로그인. 이메일/비밀번호만 받는다 — 동의(Consent)는 계정을 처음 만들 때만
 * 필요한 절차라 여기선 다루지 않는다(ChoiceScreen 참고).
 */
export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 연속 탭으로 로그인 요청이 중복 발사되는 걸 막는다(SignupScreen과 달리 state만으로는
  // 첫 탭과 두 번째 탭 사이 리렌더 지연 동안 통과할 수 있어 ref로 동기 차단).
  const hasSubmitted = useRef(false);

  const setSession = useAuthStore((s) => s.setSession);

  const isValid = EMAIL_RE.test(email) && password.length >= 1;

  const onSubmit = async () => {
    if (!isValid || hasSubmitted.current) return;
    hasSubmitted.current = true;
    setSubmitting(true);
    try {
      const res = await login({ email, password });
      setSession(res.access_token, res.user);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch {
      Alert.alert('로그인 실패', '이메일 또는 비밀번호를 확인해 주세요.');
      hasSubmitted.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>로그인</Text>
      <Text style={styles.desc}>이미 계정이 있다면 이메일과 비밀번호로 로그인하세요.</Text>

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
          placeholder="비밀번호"
          placeholderTextColor="#A6B39A"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      <Pressable
        style={[styles.submitButton, (!isValid || submitting) && styles.disabled]}
        onPress={() => void onSubmit()}
        disabled={!isValid || submitting}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>로그인</Text>}
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
