import { useCallback, useRef, useState, type RefObject } from 'react';
import { Vibration } from 'react-native';
import type { CameraView } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { previewScan } from '@/api/vision';
import type { PreviewScanResponse } from '@/types/api';

export interface ScanPoint {
  x: number;
  y: number;
}

/** 크롭 영역 비율(터치 지점 주변). */
const CROP_RATIO = 0.4;
const RESULT_TTL_MS = 4500;

/**
 * F19 터치 기반 사전 위험 경고 훅.
 * 프리뷰 터치 → 1프레임 촬영 → 터치 지점 크롭(저해상도) → preview-scan → 잠정 결과.
 * 상시 스캔이 아니라 터치 시점에만 1회 호출한다(배터리·발열 최소화).
 */
export function usePreviewScan(cameraRef: RefObject<CameraView | null>) {
  const [scanning, setScanning] = useState(false);
  const [point, setPoint] = useState<ScanPoint | null>(null);
  const [result, setResult] = useState<PreviewScanResponse | null>(null);
  const ttlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (ttlTimer.current) clearTimeout(ttlTimer.current);
    setPoint(null);
    setResult(null);
  }, []);

  const scanAt = useCallback(
    async (screenX: number, screenY: number, layoutW: number, layoutH: number) => {
      if (scanning || !cameraRef.current || layoutW <= 0 || layoutH <= 0) return;
      if (ttlTimer.current) clearTimeout(ttlTimer.current);

      const normX = Math.min(Math.max(screenX / layoutW, 0), 1);
      const normY = Math.min(Math.max(screenY / layoutH, 0), 1);

      setPoint({ x: screenX, y: screenY });
      setResult(null);
      setScanning(true);

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          skipProcessing: true,
        });
        if (!photo) return;

        // 터치 지점 주변을 크롭 → 저해상도로 축소 → base64.
        const cropW = Math.round(photo.width * CROP_RATIO);
        const cropH = Math.round(photo.height * CROP_RATIO);
        const originX = Math.min(Math.max(normX * photo.width - cropW / 2, 0), photo.width - cropW);
        const originY = Math.min(Math.max(normY * photo.height - cropH / 2, 0), photo.height - cropH);

        const context = ImageManipulator.manipulate(photo.uri);
        context
          .crop({ originX, originY, width: cropW, height: cropH })
          .resize({ width: 160 });
        const rendered = await context.renderAsync();
        const out = await rendered.saveAsync({ format: SaveFormat.JPEG, base64: true });

        const res = await previewScan({ x: normX, y: normY, image: out.base64 ?? '' });
        setResult(res);
        if (res.is_dangerous) Vibration.vibrate(200);

        ttlTimer.current = setTimeout(() => {
          setPoint(null);
          setResult(null);
        }, RESULT_TTL_MS);
      } catch {
        setPoint(null);
        setResult(null);
      } finally {
        setScanning(false);
      }
    },
    [scanning, cameraRef]
  );

  return { scanning, point, result, scanAt, clear };
}
