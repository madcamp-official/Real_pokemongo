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

/** 크롭 영역 비율(터치 지점 주변). 너무 좁으면 작은 좌표 오차에도 피사체가 잘린다. */
const CROP_RATIO = 0.45;
/** BioCLIP 입력에 충분하면서 전송·디코딩 비용이 작은 프리뷰 크기. */
const PREVIEW_IMAGE_WIDTH = 224;
const RESULT_TTL_MS = 4500;

/**
 * CameraView는 센서 이미지와 화면 비율이 다르면 cover 방식으로 가장자리를 잘라 보여준다.
 * 화면 터치 좌표를 사진에 단순 비율로 곱하면 그 잘린 영역만큼 어긋나므로, 실제 cover
 * 스케일과 오프셋을 역산해 사진 픽셀 좌표로 바꾼다.
 */
export function previewPointToPhotoPoint(
  screenX: number,
  screenY: number,
  layoutW: number,
  layoutH: number,
  photoW: number,
  photoH: number
): { x: number; y: number } {
  const scale = Math.max(layoutW / photoW, layoutH / photoH);
  const renderedW = photoW * scale;
  const renderedH = photoH * scale;
  const cropX = Math.max((renderedW - layoutW) / 2, 0);
  const cropY = Math.max((renderedH - layoutH) / 2, 0);
  return {
    x: Math.min(Math.max((screenX + cropX) / scale, 0), photoW),
    y: Math.min(Math.max((screenY + cropY) / scale, 0), photoH),
  };
}

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
  const scanGeneration = useRef(0);

  const clear = useCallback(() => {
    // 진행 중인 요청의 응답이 촬영 로더 위에 뒤늦게 다시 나타나지 않게 무효화한다.
    scanGeneration.current += 1;
    if (ttlTimer.current) clearTimeout(ttlTimer.current);
    ttlTimer.current = null;
    setScanning(false);
    setPoint(null);
    setResult(null);
  }, []);

  const scanAt = useCallback(
    async (screenX: number, screenY: number, layoutW: number, layoutH: number) => {
      if (scanning || !cameraRef.current || layoutW <= 0 || layoutH <= 0) return;
      if (ttlTimer.current) clearTimeout(ttlTimer.current);
      const generation = ++scanGeneration.current;

      const normX = Math.min(Math.max(screenX / layoutW, 0), 1);
      const normY = Math.min(Math.max(screenY / layoutH, 0), 1);

      setPoint({ x: screenX, y: screenY });
      setResult(null);
      setScanning(true);

      try {
        const photo = await cameraRef.current.takePictureAsync({
          // skipProcessing=true면 quality가 무시되고 기기별 사진 방향도 불확실해져,
          // 화면 터치 위치와 실제 크롭 위치가 어긋난다. 방향 보정을 유지하되 중간 품질로
          // 압축해 후속 크롭/전송 비용을 줄인다.
          quality: 0.55,
        });
        if (!photo) return;

        // CameraView의 cover 크롭을 반영해 터치 지점을 사진 픽셀 좌표로 변환한 뒤,
        // 그 주변을 모델 입력 크기로 축소한다.
        const photoPoint = previewPointToPhotoPoint(
          screenX,
          screenY,
          layoutW,
          layoutH,
          photo.width,
          photo.height
        );
        const cropW = Math.round(photo.width * CROP_RATIO);
        const cropH = Math.round(photo.height * CROP_RATIO);
        const originX = Math.min(Math.max(photoPoint.x - cropW / 2, 0), photo.width - cropW);
        const originY = Math.min(Math.max(photoPoint.y - cropH / 2, 0), photo.height - cropH);

        const context = ImageManipulator.manipulate(photo.uri);
        context
          .crop({ originX, originY, width: cropW, height: cropH })
          .resize({ width: PREVIEW_IMAGE_WIDTH });
        const rendered = await context.renderAsync();
        const out = await rendered.saveAsync({ format: SaveFormat.JPEG, base64: true });

        const res = await previewScan({ x: normX, y: normY, image: out.base64 ?? '' });
        if (generation !== scanGeneration.current) return;
        setResult(res);
        if (res.is_dangerous) Vibration.vibrate(200);

        ttlTimer.current = setTimeout(() => {
          if (generation !== scanGeneration.current) return;
          setPoint(null);
          setResult(null);
        }, RESULT_TTL_MS);
      } catch {
        if (generation === scanGeneration.current) {
          setPoint(null);
          setResult(null);
        }
      } finally {
        if (generation === scanGeneration.current) setScanning(false);
      }
    },
    [scanning, cameraRef]
  );

  return { scanning, point, result, scanAt, clear };
}
