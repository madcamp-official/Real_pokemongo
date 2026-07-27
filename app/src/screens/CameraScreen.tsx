import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { GuideOverlay } from '@/components/camera/GuideOverlay';
import { CaptureButton } from '@/components/camera/CaptureButton';
import { ControlButton } from '@/components/camera/ControlButton';
import { CapturingLoader } from '@/components/camera/CapturingLoader';
import { UploadStatusStrip } from '@/components/camera/UploadStatusStrip';
import { PreviewScanOverlay } from '@/components/camera/PreviewScanOverlay';
import { useCapture } from '@/hooks/useCapture';
import { usePreviewScan } from '@/hooks/usePreviewScan';
import { useAuthStore, GUEST_SIGHTING_LIMIT } from '@/store/authStore';
import { useRewardsStore, isCameraFrameUnlocked } from '@/store/rewardsStore';
import { colors, cameraTheme } from '@/theme/colors';
import type { RootStackParamList, RootTabParamList } from '@/navigation/types';

/**
 * F2 생물 촬영 화면("탐험 모드").
 *
 * 화면 구성은 시안을 그대로 따른다 — 상단은 [뒤로] · 탐험 모드 · [플래시] 3분할,
 * 하단은 힌트 알약 + 셔터 + 잠정치 안내 캡션만. 갤러리·화면전환·촬영모드 같은
 * 부가 버튼은 두지 않는다(아이가 셔터 하나에만 집중하도록).
 * 연속 촬영은 버튼 대신 "셔터를 꾹 누르고 있기"로, 위치는 항상 첨부한다.
 */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [torchOn, setTorchOn] = useState(false);

  const { isHolding, isFinishing, frameCount, startCapture, endCapture } = useCapture(cameraRef);
  const { scanning, point, result, scanAt, clear } = usePreviewScan(cameraRef);
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 });

  const isGuest = useAuthStore((s) => s.isGuest);
  const guestSightingCount = useAuthStore((s) => s.guestSightingCount);
  const level = useRewardsStore((s) => s.level);
  const frameUnlocked = isCameraFrameUnlocked(level);
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const guestLimitReached = isGuest && guestSightingCount >= GUEST_SIGHTING_LIMIT;
  const goBack = () => navigation.navigate('Map');

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

  // F19: 프리뷰 빈 영역 터치 → 사전 위험 스캔 (셔터와 별도 동작)
  const onPreviewLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPreviewSize({ w: width, h: height });
  };
  const onPreviewTouch = (e: GestureResponderEvent) => {
    if (isHolding || isFinishing) return;
    const { locationX, locationY } = e.nativeEvent;
    void scanAt(locationX, locationY, previewSize.w, previewSize.h);
  };

  const hint = isHolding
    ? `연속으로 담는 중 · ${frameCount}장`
    : scanning
      ? '누른 곳을 살펴보고 있어요...'
      : '화면 속 친구를 콕! 눌러보세요';

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torchOn}
      />

      {/* F19: 프리뷰 터치 감지 레이어 (컨트롤 아래, 카메라 위) */}
      <View
        style={StyleSheet.absoluteFill}
        onLayout={onPreviewLayout}
        onStartShouldSetResponder={() => true}
        onResponderRelease={onPreviewTouch}
      />

      {/* 상·하단 비네트 — 흰 컨트롤이 밝은 배경 위에서도 읽히게 한다 */}
      <LinearGradient
        pointerEvents="none"
        colors={[cameraTheme.vignette, cameraTheme.vignetteFade]}
        style={[styles.topVignette, { height: insets.top + 150 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[cameraTheme.vignetteFade, cameraTheme.vignette]}
        style={[styles.bottomVignette, { height: insets.bottom + 230 }]}
      />

      <GuideOverlay accentColor={frameUnlocked ? colors.funFactAccent : undefined} />

      <PreviewScanOverlay
        scanning={scanning}
        point={point}
        result={result}
        containerW={previewSize.w}
        containerH={previewSize.h}
        onDismiss={clear}
      />

      {/* 상단 바: [뒤로] · 탐험 모드 · [플래시] */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <ControlButton icon="‹" label="지도로 돌아가기" onPress={goBack} />
        <View style={styles.modePill}>
          <Text style={styles.modePillText}>탐험 모드</Text>
        </View>
        <ControlButton
          icon="⚡"
          label={torchOn ? '플래시 끄기' : '플래시 켜기'}
          active={torchOn}
          onPress={() => setTorchOn((v) => !v)}
        />
      </View>

      {/* 상단 배지 줄: 상태 표시는 한 줄에 모아 프레임 중앙을 비워 둔다 */}
      <View pointerEvents="box-none" style={[styles.badgeRow, { top: insets.top + 64 }]}>
        {isGuest && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              게스트 체험 {Math.min(guestSightingCount, GUEST_SIGHTING_LIMIT)}/{GUEST_SIGHTING_LIMIT}
            </Text>
          </View>
        )}
        {frameUnlocked && (
          <View style={[styles.badge, styles.badgeGold]}>
            <Text style={styles.badgeText}>✨ 골드 프레임</Text>
          </View>
        )}
        <UploadStatusStrip />
      </View>

      {/* 하단: 힌트 알약 → 셔터 → 잠정치 안내 캡션 */}
      <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>

        <CaptureButton
          holding={isHolding}
          disabled={isFinishing}
          onPressIn={onShutterPressIn}
          onPressOut={onShutterPressOut}
        />

        {/* 리스크 3(잠정치 오인) 대응 — 스캔 결과를 확정으로 오해하지 않도록 상시 노출 */}
        <Text style={styles.caption}>꾹 누르면 연속으로 담아요 · 찍으면 정확히 알려드려요</Text>
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

  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modePill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: cameraTheme.pill,
  },
  modePillText: { color: cameraTheme.pillText, fontSize: 14, fontWeight: '800' },

  badgeRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: cameraTheme.control,
  },
  badgeGold: { backgroundColor: 'rgba(224,169,62,0.7)' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 16,
  },
  hintPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: cameraTheme.pill,
  },
  hintText: { color: cameraTheme.pillText, fontSize: 14, fontWeight: '700' },

  caption: { color: cameraTheme.caption, fontSize: 11, textAlign: 'center' },
});
