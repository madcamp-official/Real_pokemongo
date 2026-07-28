import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ScreenHeader } from '@/components/nav/ScreenHeader';
import { useAuthStore, GUEST_SIGHTING_LIMIT } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { fetchRestoreBundle, deleteAccount, fetchPrivacySettings, updatePrivacySettings } from '@/api/account';
import { colors } from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/types';

/**
 * F18 설정 & 계정 관리 화면.
 * 계정 정보, 알림/위치·사진 수집 범위 토글, 데이터 복원, 계정 삭제, 로그아웃.
 */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isGuest = useAuthStore((s) => s.isGuest);
  const guestSightingCount = useAuthStore((s) => s.guestSightingCount);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetGuestData = useAuthStore((s) => s.resetGuestData);

  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const locationCollectionEnabled = useSettingsStore((s) => s.locationCollectionEnabled);
  const photoCollectionEnabled = useSettingsStore((s) => s.photoCollectionEnabled);
  const audioRecordingEnabled = useSettingsStore((s) => s.audioRecordingEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setLocationCollectionEnabled = useSettingsStore((s) => s.setLocationCollectionEnabled);
  const setPhotoCollectionEnabled = useSettingsStore((s) => s.setPhotoCollectionEnabled);
  const setAudioRecordingEnabled = useSettingsStore((s) => s.setAudioRecordingEnabled);

  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  // 로컬 저장소(zustand)는 오프라인 폴백/즉각 표시용일 뿐, 진짜 값은 서버(User.
  // locationStorageEnabled, ConsentRecord.photo)에 있다 — 화면 진입 시 서버 값으로
  // 맞춰서 "기기를 바꾸거나 재설치해도 설정이 그대로"가 실제로 보장되게 한다.
  const privacyQuery = useQuery({
    queryKey: ['account', 'privacy-settings'],
    queryFn: fetchPrivacySettings,
  });
  useEffect(() => {
    if (!privacyQuery.data) return;
    setLocationCollectionEnabled(privacyQuery.data.location);
    setPhotoCollectionEnabled(privacyQuery.data.photo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privacyQuery.data]);

  const onChangePrivacy = async (next: { location: boolean; photo: boolean }) => {
    if (savingPrivacy) return;
    const prev = { location: locationCollectionEnabled, photo: photoCollectionEnabled };
    // 낙관적 갱신 — 토글은 누르자마자 바뀌어야 자연스럽고, 실패는 드물다(실패 시 아래서 되돌림).
    setLocationCollectionEnabled(next.location);
    setPhotoCollectionEnabled(next.photo);
    setSavingPrivacy(true);
    try {
      await updatePrivacySettings(next);
    } catch {
      setLocationCollectionEnabled(prev.location);
      setPhotoCollectionEnabled(prev.photo);
      Alert.alert('설정 저장 실패', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const navigation = useNavigation();
  const goToConvert = () =>
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('Consent', { mode: 'convert' });

  const goToChoice = () =>
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.reset({ index: 0, routes: [{ name: 'Choice' }] });

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const res = await fetchRestoreBundle();
      Alert.alert('복원 완료', `도감 ${res.dex_count}종 등 데이터를 불러왔어요.`);
    } catch {
      Alert.alert('복원 실패', '잠시 후 다시 시도해 주세요.');
    } finally {
      setRestoring(false);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      '계정을 삭제할까요?',
      '도감·기록을 포함한 모든 데이터가 영구적으로 삭제되며 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              logout();
              goToChoice();
            } catch {
              Alert.alert('삭제 실패', '잠시 후 다시 시도해 주세요.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const onLogout = () => {
    Alert.alert('로그아웃 할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: () => {
          logout();
          goToChoice();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="설정" />
      <ScrollView contentContainerStyle={styles.content}>
      {isGuest ? (
        <Pressable style={styles.guestBanner} onPress={goToConvert}>
          <Text style={styles.guestBannerTitle}>게스트 모드입니다</Text>
          <Text style={styles.guestBannerDesc}>
            촬영 {Math.min(guestSightingCount, GUEST_SIGHTING_LIMIT)}/{GUEST_SIGHTING_LIMIT}회 체험 중 ·
            정식 계정으로 전환하면 기록을 이어갈 수 있어요 →
          </Text>
        </Pressable>
      ) : (
        user && (
          <View style={styles.accountCard}>
            <Text style={styles.accountAvatar}>{user.avatar}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{user.nickname}</Text>
              <Text style={styles.accountEmail}>{user.email}</Text>
            </View>
          </View>
        )
      )}

      <Section title="알림 · 개인정보">
        <ToggleRow
          label="알림 받기"
          value={notificationsEnabled}
          onChange={setNotificationsEnabled}
        />
        <ToggleRow
          label="위치정보 수집"
          desc="촬영 시 위치를 함께 기록해요 (흐릿하게 처리)"
          value={locationCollectionEnabled}
          onChange={(v) => void onChangePrivacy({ location: v, photo: photoCollectionEnabled })}
          disabled={savingPrivacy || privacyQuery.isLoading}
        />
        <ToggleRow
          label="사진 수집·이용"
          desc="저품질 사진을 촬영 품질 개선 학습에 사용해요"
          value={photoCollectionEnabled}
          onChange={(v) => void onChangePrivacy({ location: locationCollectionEnabled, photo: v })}
          disabled={savingPrivacy || privacyQuery.isLoading}
        />
        <ToggleRow
          label="소리 녹음·분석"
          desc="주변 생물 소리를 최대 15초 녹음해 서버에서 분석해요"
          value={audioRecordingEnabled}
          onChange={setAudioRecordingEnabled}
        />
      </Section>

      {!isGuest && (
        <Section title="계정">
          <Pressable style={styles.rowButton} onPress={() => void onRestore()} disabled={restoring}>
            {restoring ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.rowButtonText}>데이터 복원하기</Text>
            )}
          </Pressable>
          <Pressable style={styles.rowButton} onPress={onLogout}>
            <Text style={styles.rowButtonText}>로그아웃</Text>
          </Pressable>
          <Pressable
            style={styles.rowButton}
            onPress={onDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color={colors.dangerText} />
            ) : (
              <Text style={[styles.rowButtonText, styles.dangerText]}>계정 삭제</Text>
            )}
          </Pressable>
        </Section>
      )}

      {isGuest && (
        <Section title="게스트">
          <Pressable
            style={styles.rowButton}
            onPress={() => {
              resetGuestData();
              goToChoice();
            }}
          >
            <Text style={[styles.rowButtonText, styles.dangerText]}>게스트 체험 종료</Text>
          </Pressable>
        </Section>
      )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {desc && <Text style={styles.toggleDesc}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 16 },

  guestBanner: { padding: 16, borderRadius: 16, backgroundColor: colors.primary },
  guestBannerTitle: { color: colors.onPrimary, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  guestBannerDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },

  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountAvatar: { fontSize: 36 },
  accountName: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  accountEmail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },

  section: { gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    paddingHorizontal: 4,
  },
  sectionBody: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  toggleDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  rowButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowButtonText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  dangerText: { color: colors.dangerText },
});
