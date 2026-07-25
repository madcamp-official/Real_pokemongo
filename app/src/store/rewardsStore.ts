import { create } from 'zustand';

/**
 * 레벨 공유 상태 (F8).
 * RewardsScreen 에서 서버 XP 프로필을 조회할 때마다 이 값을 갱신하고,
 * 홈가든·카메라 화면은 이 값만 가볍게 구독해 레벨업 언락 아이템을 반영한다.
 * (react-query 캐시를 화면마다 별도로 구독하지 않도록 하는 경량 공유 상태 — 영속화 불필요.)
 */
interface RewardsState {
  level: number;
  setLevel: (level: number) => void;
}

export const useRewardsStore = create<RewardsState>((set) => ({
  level: 1,
  setLevel: (level) => set({ level }),
}));

/** 레벨 임계값별 코스메틱 언락 정의. */
export const LEVEL_UNLOCKS = {
  gardenBorder: 2, // 홈가든 그리드 반짝이는 테두리
  cameraFrame: 3, // 카메라 가이드 프레임 금색 강조
} as const;

export function isGardenBorderUnlocked(level: number): boolean {
  return level >= LEVEL_UNLOCKS.gardenBorder;
}
export function isCameraFrameUnlocked(level: number): boolean {
  return level >= LEVEL_UNLOCKS.cameraFrame;
}
