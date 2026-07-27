import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GuideOverlay } from '@/components/camera/GuideOverlay';
import { CaptureButton } from '@/components/camera/CaptureButton';
import { CapturingLoader } from '@/components/camera/CapturingLoader';
import { PreviewScanOverlay } from '@/components/camera/PreviewScanOverlay';
import { useCapture } from '@/hooks/useCapture';
import { usePreviewScan } from '@/hooks/usePreviewScan';
import { useAuthStore, GUEST_SIGHTING_LIMIT } from '@/store/authStore';
import { colors, cameraTheme } from '@/theme/colors';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';
import { pickFromGallery } from '@/services/gallery';
import { persistPhoto } from '@/services/photoStorage';
import { requestLocationAndGet } from '@/services/location';
import { useUploadQueue } from '@/store/uploadQueueStore';

/**
 * F2 생물 촬영 화면("탐험 모드").
 *
 * 카메라가 주인공인 간단한 구성: 닫기 버튼과 하단의 갤러리 · 셔터 · 줌만 둔다.
 * 연속 촬영은 버튼 대신 "셔터를 꾹 누르고 있기"로, 위치는 항상 첨부한다.
 */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0);
  const pinchStartZoom = useRef(0);

  const { isHolding, isFinishing, frameCount, startCapture, endCapture } = useCapture(cameraRef);
  const { scanning, point, result, scanAt, clear } = usePreviewScan(cameraRef);
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 });

  const isGuest = useAuthStore((s) => s.isGuest);
  const guestSightingCount = useAuthStore((s) => s.guestSightingCount);
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const enqueue = useUploadQueue((s) => s.enqueue);
  const incrementGuestSighting = useAuthStore((s) => s.incrementGuestSighting);

  const guestLimitReached = isGuest && guestSightingCount >= GUEST_SIGHTING_LIMIT;
  const goBack = () => navigation.navigate('Map');
  const setCameraZoom = (value: number) => {
    // expo-camera는 0~1 범위를 사용한다. 너무 큰 확대는 피사체 찾기를 어렵게 하므로 3배 근처로 제한한다.
    const next = Math.max(0, Math.min(0.85, value));
    zoomRef.current = next;
    setZoom(next);
  };
  const zoomMultiplier = 1 + zoom * 2.2;
  const zoomLabel = `${zoomMultiplier % 1 < 0.05 ? Math.round(zoomMultiplier) : zoomMultiplier.toFixed(1)}×`;
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartZoom.current = zoomRef.current;
        })
        .onUpdate((event) => {
          // scale은 1을 기준으로 움직이므로 로그를 사용해 확대/축소 감도를 대칭으로 맞춘다.
          setCameraZoom(pinchStartZoom.current + Math.log2(event.scale) * 0.24);
        }),
    []
  );
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      if (success && !isHolding && !isFinishing) {
        void scanAt(event.x, event.y, previewSize.w, previewSize.h);
      }
    });
  const cameraGesture = Gesture.Simultaneous(pinchGesture, tapGesture);

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
        <ActivityIndicator color={colors.primary} />
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
        <Pressable style={styles.permBack} onPress={goBack}>
          <Text style={styles.permBackText}>지도로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  const openIdentify = (uploadId: string) => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('IdentifyResult', { uploadId });
  };

  const onShutterPressIn = () => {
    if (guestLimitReached) {
      promptGuestUpgrade();
      return;
    }
    startCapture();
  };

  const onShutterPressOut = () => {
    void endCapture()
      .then((uploadId) => {
        if (uploadId) openIdentify(uploadId);
      })
      .catch(() => {
        // 촬영 마무리 실패는 조용히 넘긴다 — 다시 누르면 재시도된다.
        // (미처리 프라미스로 새면 개발 빌드에서 빨간 에러 오버레이가 뜬다)
      });
  };

  const onPreviewLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewSize({ w: width, h: height });
  };

  const openGallery = async () => {
    if (guestLimitReached) {
      promptGuestUpgrade();
      return;
    }
    const photo = await pickFromGallery();
    if (!photo) return;

    const uri = await persistPhoto(photo.uri, `gallery_${Date.now()}.jpg`);
    const coord = photo.hasLocation ? await requestLocationAndGet().catch(() => null) : null;
    const uploadId = enqueue({
      frameUris: [uri],
      hasLocation: !!coord,
      coord: coord ?? undefined,
      fromGallery: true,
    });
    if (isGuest) incrementGuestSighting();
    openIdentify(uploadId);
  };

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={zoom}
      />

      <GestureDetector gesture={cameraGesture}>
        <View style={StyleSheet.absoluteFill} onLayout={onPreviewLayout} />
      </GestureDetector>

      {/* 피사체를 맞추는 네 모서리 가이드만 표시한다. */}
      <GuideOverlay />

      <PreviewScanOverlay
        scanning={scanning}
        point={point}
        result={result}
        containerW={previewSize.w}
        containerH={previewSize.h}
        onDismiss={clear}
      />

      {/* 상·하단 비네트 — 흰 컨트롤이 밝은 배경 위에서도 읽히게 한다 */}
      <LinearGradient
        pointerEvents="none"
        colors={[cameraTheme.vignette, cameraTheme.vignetteFade]}
        style={[styles.topVignette, { height: insets.top + 80 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[cameraTheme.vignetteFade, cameraTheme.vignette]}
        style={[styles.bottomVignette, { height: insets.bottom + 150 }]}
      />

      <Pressable
        onPress={goBack}
        style={[styles.closeButton, { top: insets.top + 10 }]}
        accessibilityRole="button"
        accessibilityLabel="촬영 닫기"
      >
        <Text style={styles.closeIcon}>×</Text>
      </Pressable>

      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.captureRow}>
          <Pressable
            onPress={() => void openGallery()}
            style={styles.roundControl}
            accessibilityRole="button"
            accessibilityLabel="사진 보관함에서 불러오기"
          >
            <Text style={styles.galleryIcon}>▣</Text>
          </Pressable>
          <CaptureButton
            holding={isHolding}
            disabled={isFinishing}
            onPressIn={onShutterPressIn}
            onPressOut={onShutterPressOut}
          />
          <Pressable
            onPress={() => setCameraZoom(zoom < 0.2 ? 0.45 : 0)}
            style={[styles.roundControl, zoom > 0 && styles.roundControlActive]}
            accessibilityRole="button"
            accessibilityLabel={`현재 ${zoomLabel} 줌, 눌러서 ${zoom < 0.2 ? '2' : '1'}배로 전환`}
          >
            <Text style={styles.zoomText}>{zoomLabel}</Text>
          </Pressable>
        </View>
        <Text style={styles.caption}>
          {isHolding ? `연속 촬영 중 · ${frameCount}장` : '짧게 누르면 촬영 · 길게 누르면 연속 촬영'}
        </Text>
      </View>

      {/* 손을 뗀 뒤 위치 첨부·큐 등록 동안에만 가린다(누르는 중엔 프리뷰를 덮지 않는다) */}
      <CapturingLoader visible={isFinishing} label="담는 중..." />
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
    backgroundColor: colors.background,
  },
  permTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 },
  permDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  permButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
  },
  permButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  permBack: { marginTop: 14, paddingVertical: 8 },
  permBackText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },

  topVignette: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottomVignette: { position: 'absolute', bottom: 0, left: 0, right: 0 },

  closeButton: {
    position: 'absolute',
    left: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 30, 30, 0.35)',
  },
  closeIcon: { color: '#fff', fontSize: 31, fontWeight: '300', lineHeight: 34 },

  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 12,
  },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  roundControl: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  roundControlActive: { backgroundColor: 'rgba(224, 239, 255, 0.95)' },
  galleryIcon: { color: '#171A27', fontSize: 27, fontWeight: '800' },
  zoomText: { color: '#171A27', fontSize: 16, fontWeight: '800' },
  caption: { color: cameraTheme.caption, fontSize: 12, textAlign: 'center' },
});
