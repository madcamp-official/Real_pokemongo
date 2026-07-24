import { useCallback, useState, type RefObject } from 'react';
import type { CameraView } from 'expo-camera';
import { persistPhoto } from '@/services/photoStorage';
import { requestLocationAndGet, type Coord } from '@/services/location';
import { useUploadQueue } from '@/store/uploadQueueStore';
import { useAuthStore } from '@/store/authStore';
import type { CaptureMode } from '@/components/camera/CaptureButton';

const BURST_COUNT = 3;
const BURST_INTERVAL_MS = 220;

/**
 * 촬영 오케스트레이션 훅 (F2).
 * 단일/버스트 촬영 → 로컬 영구 저장 → (선택)위치 첨부 → 업로드 큐 등록.
 */
export function useCapture(
  cameraRef: RefObject<CameraView | null>,
  attachLocation: boolean
) {
  const [isCapturing, setIsCapturing] = useState(false);
  const enqueue = useUploadQueue((s) => s.enqueue);
  const isGuest = useAuthStore((s) => s.isGuest);
  const incrementGuestSighting = useAuthStore((s) => s.incrementGuestSighting);

  const capture = useCallback(
    async (mode: CaptureMode): Promise<string | null> => {
      if (isCapturing || !cameraRef.current) return null;
      setIsCapturing(true);
      try {
        const shots = mode === 'burst' ? BURST_COUNT : 1;
        const persisted: string[] = [];

        for (let i = 0; i < shots; i++) {
          const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
          if (!photo) continue;
          const uri = await persistPhoto(photo.uri, `cap_${Date.now()}_${i}.jpg`);
          persisted.push(uri);
          if (i < shots - 1) {
            await new Promise<void>((r) => setTimeout(r, BURST_INTERVAL_MS));
          }
        }
        if (persisted.length === 0) return null;

        let coord: Coord | undefined;
        let hasLocation = false;
        if (attachLocation) {
          const c = await requestLocationAndGet();
          if (c) {
            coord = c;
            hasLocation = true;
          }
        }

        const uploadId = enqueue({ frameUris: persisted, hasLocation, coord, fromGallery: false });
        if (isGuest) incrementGuestSighting();
        return uploadId;
      } finally {
        setIsCapturing(false);
      }
    },
    [isCapturing, cameraRef, attachLocation, enqueue, isGuest, incrementGuestSighting]
  );

  return { isCapturing, capture };
}
