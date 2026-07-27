import { useCallback, useRef, useState, type RefObject } from 'react';
import type { CameraView } from 'expo-camera';
import { persistPhoto } from '@/services/photoStorage';
import { requestLocationAndGet } from '@/services/location';
import { useUploadQueue } from '@/store/uploadQueueStore';
import { useAuthStore } from '@/store/authStore';

/** 연속 촬영 간격. 너무 짧으면 카메라가 못 따라오고 같은 장면만 쌓인다. */
const BURST_INTERVAL_MS = 260;
/** 한 번의 누름으로 담을 수 있는 최대 장수(저장 용량·업로드 시간 상한). */
const MAX_FRAMES = 8;

/**
 * 촬영 오케스트레이션 훅 (F2).
 *
 * 셔터를 누르는 동안 계속 찍고 떼면 끝난다 — 짧게 톡 누르면 1장(단일),
 * 꾹 누르고 있으면 여러 장(연속)이 자연스럽게 이어진다. 별도 모드 토글이 없다.
 * 담긴 프레임들은 한 건의 sighting 으로 묶여 업로드 큐에 올라간다.
 * 위치는 항상 첨부한다(발견 장소가 없으면 탐험 지도에 핀이 남지 않는다).
 */
export function useCapture(cameraRef: RefObject<CameraView | null>) {
  /** 셔터를 누르고 있는 동안 true. */
  const [isHolding, setIsHolding] = useState(false);
  /** 손을 뗀 뒤 위치 첨부·큐 등록을 마무리하는 동안 true. */
  const [isFinishing, setIsFinishing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  const holdingRef = useRef(false);
  const framesRef = useRef<string[]>([]);
  const loopRef = useRef<Promise<void> | null>(null);

  const enqueue = useUploadQueue((s) => s.enqueue);
  const isGuest = useAuthStore((s) => s.isGuest);
  const incrementGuestSighting = useAuthStore((s) => s.incrementGuestSighting);

  const runLoop = useCallback(async () => {
    while (holdingRef.current && framesRef.current.length < MAX_FRAMES) {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
        if (photo) {
          const uri = await persistPhoto(
            photo.uri,
            `cap_${Date.now()}_${framesRef.current.length}.jpg`
          );
          framesRef.current.push(uri);
          setFrameCount(framesRef.current.length);
        }
      } catch {
        // 한 장 실패는 촬영 전체를 깨뜨리지 않는다 — 다음 장으로 넘어간다.
      }
      if (!holdingRef.current) break;
      await new Promise<void>((r) => setTimeout(r, BURST_INTERVAL_MS));
    }
  }, [cameraRef]);

  /** 셔터를 누른 순간(onPressIn). */
  const startCapture = useCallback(() => {
    if (holdingRef.current || isFinishing || !cameraRef.current) return;
    holdingRef.current = true;
    framesRef.current = [];
    setFrameCount(0);
    setIsHolding(true);
    loopRef.current = runLoop();
  }, [cameraRef, isFinishing, runLoop]);

  /** 셔터에서 손을 뗀 순간(onPressOut). 담긴 프레임을 업로드 큐에 올린다. */
  const endCapture = useCallback(async (): Promise<string | null> => {
    if (!holdingRef.current) return null;
    holdingRef.current = false;
    setIsHolding(false);
    setIsFinishing(true);
    try {
      // 진행 중이던 마지막 한 장이 저장될 때까지 기다린다(안 그러면 누락된다).
      await loopRef.current;

      const frames = framesRef.current;
      framesRef.current = [];
      setFrameCount(0);
      if (frames.length === 0) return null;

      // 위치 실패는 무시하고 촬영은 살린다(핀만 안 남는다).
      const coord = await requestLocationAndGet().catch(() => null);
      const uploadId = enqueue({
        frameUris: frames,
        hasLocation: !!coord,
        coord: coord ?? undefined,
        fromGallery: false,
      });
      if (isGuest) incrementGuestSighting();
      return uploadId;
    } finally {
      setIsFinishing(false);
    }
  }, [enqueue, isGuest, incrementGuestSighting]);

  return { isHolding, isFinishing, frameCount, startCapture, endCapture };
}
