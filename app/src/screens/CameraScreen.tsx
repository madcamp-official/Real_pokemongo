import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { GuideOverlay } from '@/components/camera/GuideOverlay';
import { CaptureButton, type CaptureMode } from '@/components/camera/CaptureButton';
import { CapturingLoader } from '@/components/camera/CapturingLoader';
import { UploadStatusStrip } from '@/components/camera/UploadStatusStrip';
import { useCapture } from '@/hooks/useCapture';
import { pickFromGallery } from '@/services/gallery';
import { persistPhoto } from '@/services/photoStorage';
import { useUploadQueue } from '@/store/uploadQueueStore';
import { useAuthStore, GUEST_SIGHTING_LIMIT } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { RootStackParamList } from '@/navigation/types';

/**
 * F2 생물 촬영 화면.
 * 카메라 프리뷰 + 가이드 오버레이 + 단일/버스트 촬영 + 갤러리 불러오기 + 업로드 큐.
 */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const defaultLocationCollection = useSettingsStore((s) => s.locationCollectionEnabled);
  const [facing, setFacing] = useState<CameraType>('back');
  const [mode, setMode] = useState<CaptureMode>('single');
  const [attachLocation, setAttachLocation] = useState(defaultLocationCollection);
  const [isImporting, setIsImporting] = useState(false);

  const { isCapturing, capture } = useCapture(cameraRef, attachLocation);
  const enqueue = useUploadQueue((s) => s.enqueue);

  const isGuest = useAuthStore((s) => s.isGuest);
  const guestSightingCount = useAuthStore((s) => s.guestSightingCount);
  const navigation = useNavigation();

  const guestLimitReached = isGuest && guestSightingCount >= GUEST_SIGHTING_LIMIT;

  const promptGuestUpgrade = () => {
    Alert.alert(
      '게스트 체험이 끝났어요',
      `게스트는 촬영을 ${GUEST_SIGHTING_LIMIT}회까지만 담을 수 있어요. 계정을 만들면 계속 기록할 수 있어요.`,
      [
        { text: '나중에', style: 'cancel' },
        {
          text: '계정 만들기',
          onPress: () =>
            navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.navigate(
              'Consent',
              { mode: 'convert' }
            ),
        },
      ]
    );
  };

  // ── 권한 미결정: 로딩 ──────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#5B8C3E" />
      </View>
    );
  }

  // ── 권한 미허용: 요청 UI (위치와 분리된 카메라 전용 요청) ────────
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>카메라 권한이 필요해요</Text>
        <Text style={styles.permDesc}>
          생물을 촬영해 도감에 기록하려면 카메라 접근을 허용해 주세요.
        </Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>카메라 허용하기</Text>
        </Pressable>
      </View>
    );
  }

  const openIdentify = (uploadId: string) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('IdentifyResult', { uploadId });
  };

  const onGallery = async () => {
    if (isImporting) return;
    if (guestLimitReached) {
      promptGuestUpgrade();
      return;
    }
    setIsImporting(true);
    try {
      const picked = await pickFromGallery();
      if (!picked) return;
      const uri = await persistPhoto(picked.uri, `gal_${Date.now()}.jpg`);
      const uploadId = enqueue({
        frameUris: [uri],
        hasLocation: picked.hasLocation,
        fromGallery: true,
      });
      if (isGuest) useAuthStore.getState().incrementGuestSighting();
      openIdentify(uploadId);
    } finally {
      setIsImporting(false);
    }
  };

  const onCapturePress = async () => {
    if (guestLimitReached) {
      promptGuestUpgrade();
      return;
    }
    const uploadId = await capture(mode);
    if (uploadId) openIdentify(uploadId);
  };

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      <GuideOverlay hint={mode === 'burst' ? '연속으로 여러 장 담아요' : '생물을 가운데 담아요'} />

      {isGuest && (
        <View style={[styles.guestBadge, { top: insets.top + 8 }]}>
          <Text style={styles.guestBadgeText}>
            게스트 체험 {Math.min(guestSightingCount, GUEST_SIGHTING_LIMIT)}/{GUEST_SIGHTING_LIMIT}
          </Text>
        </View>
      )}

      {/* 상단 우측 컨트롤 */}
      <View style={[styles.topControls, { top: insets.top + 8 }]}>
        <Pressable
          style={[styles.pill, attachLocation && styles.pillActive]}
          onPress={() => setAttachLocation((v) => !v)}
        >
          <Text style={styles.pillText}>{attachLocation ? '📍 위치 ON' : '📍 위치 OFF'}</Text>
        </Pressable>
        <Pressable
          style={styles.pill}
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        >
          <Text style={styles.pillText}>🔄 전환</Text>
        </Pressable>
      </View>

      {/* 하단 컨트롤 */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <UploadStatusStrip />

        <View style={styles.bottomRow}>
          <Pressable style={styles.galleryButton} onPress={onGallery} disabled={isImporting}>
            {isImporting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.galleryText}>🖼️{'\n'}갤러리</Text>
            )}
          </Pressable>

          <CaptureButton
            mode={mode}
            disabled={isCapturing}
            onCapture={() => void onCapturePress()}
            onToggleMode={() => setMode((m) => (m === 'single' ? 'burst' : 'single'))}
          />

          <View style={styles.rightSpacer} />
        </View>
      </View>

      <CapturingLoader
        visible={isCapturing}
        label={mode === 'burst' ? '연속 촬영 중...' : '담는 중...'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#F7F9F4',
  },
  permTitle: { fontSize: 20, fontWeight: '800', color: '#2E3A24', marginBottom: 10 },
  permDesc: { fontSize: 14, color: '#6B7A5E', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permButton: {
    backgroundColor: '#5B8C3E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  permButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  guestBadge: {
    position: 'absolute',
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  guestBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  topControls: { position: 'absolute', right: 16, gap: 8, alignItems: 'flex-end' },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pillActive: { backgroundColor: '#5B8C3E' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14, paddingHorizontal: 16 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  galleryButton: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryText: { color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  rightSpacer: { width: 64 },
});
