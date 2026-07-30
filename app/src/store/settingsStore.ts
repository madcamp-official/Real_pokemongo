import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/store/storage';

/**
 * F18 설정: 알림/개인정보(위치·사진) 수집 범위 토글.
 * 초기값은 F1 온보딩 동의 상태를 따르되, 설정 화면에서 언제든 바꿀 수 있다.
 */
interface SettingsState {
  notificationsEnabled: boolean;
  locationCollectionEnabled: boolean;
  photoCollectionEnabled: boolean;
  /** 오디오 녹음은 사진 동의와 별도다. 서버 동의 API가 준비되기 전 MVP에서는 기기 로컬에만 보관한다. */
  audioRecordingEnabled: boolean;
  /**
   * 게스트 온보딩은 위치 동의 화면(ConsentScreen) 자체를 안 거치기 때문에
   * locationCollectionEnabled가 계속 기본값(false)으로 남아, 촬영/녹음을 아무리 해도
   * 지도에 핀이 영영 안 뜨는 문제가 있었다(2026-07-30). 첫 촬영/녹음 시점에 인라인으로
   * 한 번 물어보기 위한 플래그 — 답을 뭘 했든 한 번 물었으면 다시 안 묻는다(설정 화면
   * 토글로는 언제든 다시 켤 수 있음).
   */
  hasPromptedLocationCollection: boolean;

  setNotificationsEnabled: (v: boolean) => void;
  setLocationCollectionEnabled: (v: boolean) => void;
  setPhotoCollectionEnabled: (v: boolean) => void;
  setAudioRecordingEnabled: (v: boolean) => void;
  setHasPromptedLocationCollection: (v: boolean) => void;
  /** 온보딩 동의 완료 시점에 초기값을 동기화한다. */
  initFromConsent: (consent: { location: boolean; photo: boolean }) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      notificationsEnabled: true,
      locationCollectionEnabled: false,
      photoCollectionEnabled: true,
      audioRecordingEnabled: false,
      hasPromptedLocationCollection: false,

      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setLocationCollectionEnabled: (v) => set({ locationCollectionEnabled: v }),
      setPhotoCollectionEnabled: (v) => set({ photoCollectionEnabled: v }),
      setAudioRecordingEnabled: (v) => set({ audioRecordingEnabled: v }),
      setHasPromptedLocationCollection: (v) => set({ hasPromptedLocationCollection: v }),
      initFromConsent: (consent) =>
        set({
          locationCollectionEnabled: consent.location,
          photoCollectionEnabled: consent.photo,
          // 정식 동의 화면을 거쳤으니 인라인 프롬프트는 다시 물을 필요가 없다.
          hasPromptedLocationCollection: true,
        }),
    }),
    {
      name: 'living-dex-settings',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
