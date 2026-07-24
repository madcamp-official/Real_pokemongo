import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/store/storage';
import { getStoredToken, setStoredToken, clearStoredToken } from '@/services/secureToken';
import type { UserProfile } from '@/types/api';

/**
 * 인증 / 세션 상태 (단일 사용자 계정 모델).
 * F1(온보딩), F18(계정) 에서 사용. 게스트 모드 세션도 여기서 관리한다.
 *
 * accessToken 은 이 스토어(AsyncStorage 기반)에 영속화하지 않는다.
 * expo-secure-store(services/secureToken)에 별도 보관하고, 앱 시작 시
 * hydrateToken() 으로 메모리 상태에 복원한다.
 */
/** 게스트는 로그인 없이 이 횟수까지만 촬영을 임시 저장할 수 있다 (F1). */
export const GUEST_SIGHTING_LIMIT = 2;

export interface ConsentState {
  privacy: boolean;
  location: boolean;
  photo: boolean;
  consentVersion: string;
  agreedAt: string;
}

interface AuthState {
  accessToken: string | null;
  hasHydratedToken: boolean;
  hasHydratedStore: boolean;

  onboardingComplete: boolean;
  consent: ConsentState | null;

  isGuest: boolean;
  guestSightingCount: number; // 게스트는 촬영 1~2회 제한 (F1)
  user: UserProfile | null;

  setSession: (token: string, user?: UserProfile) => void;
  clearSession: () => void;
  logout: () => void;
  hydrateToken: () => Promise<void>;

  setConsent: (consent: ConsentState) => void;
  completeOnboarding: () => void;

  startGuest: () => void;
  incrementGuestSighting: () => void;
  resetGuestData: () => void;
  setUser: (user: UserProfile) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      hasHydratedToken: false,
      hasHydratedStore: false,

      onboardingComplete: false,
      consent: null,

      isGuest: false,
      guestSightingCount: 0,
      user: null,

      setSession: (token, user) => {
        set((s) => ({ accessToken: token, isGuest: false, user: user ?? s.user }));
        void setStoredToken(token);
      },
      clearSession: () => {
        set({ accessToken: null, isGuest: false, user: null });
        void clearStoredToken();
      },
      // 로그아웃: 세션만 정리하고 튜토리얼은 다시 보여주지 않는다(onboardingComplete 유지).
      // RootNavigator 는 accessToken/isGuest 부재 시 Choice 화면으로 보낸다.
      logout: () => {
        set({ accessToken: null, isGuest: false, user: null });
        void clearStoredToken();
      },
      hydrateToken: async () => {
        const token = await getStoredToken();
        set({ accessToken: token, hasHydratedToken: true });
      },

      setConsent: (consent) => set({ consent }),
      completeOnboarding: () => set({ onboardingComplete: true }),

      startGuest: () => set({ isGuest: true, guestSightingCount: 0 }),
      incrementGuestSighting: () =>
        set((s) => ({ guestSightingCount: s.guestSightingCount + 1 })),
      resetGuestData: () => set({ isGuest: false, guestSightingCount: 0 }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'living-dex-auth',
      storage: createJSONStorage(() => zustandStorage),
      // accessToken/hydration 플래그는 secure-store 또는 런타임 전용이라 제외한다.
      partialize: (s) => ({
        onboardingComplete: s.onboardingComplete,
        consent: s.consent,
        isGuest: s.isGuest,
        guestSightingCount: s.guestSightingCount,
        user: s.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hasHydratedStore = true;
      },
    }
  )
);
