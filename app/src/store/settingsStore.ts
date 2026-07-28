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

  setNotificationsEnabled: (v: boolean) => void;
  setLocationCollectionEnabled: (v: boolean) => void;
  setPhotoCollectionEnabled: (v: boolean) => void;
  setAudioRecordingEnabled: (v: boolean) => void;
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

      setNotificationsEnabled: (v) => set({ notificationsEnabled: v }),
      setLocationCollectionEnabled: (v) => set({ locationCollectionEnabled: v }),
      setPhotoCollectionEnabled: (v) => set({ photoCollectionEnabled: v }),
      setAudioRecordingEnabled: (v) => set({ audioRecordingEnabled: v }),
      initFromConsent: (consent) =>
        set({
          locationCollectionEnabled: consent.location,
          photoCollectionEnabled: consent.photo,
        }),
    }),
    {
      name: 'living-dex-settings',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
