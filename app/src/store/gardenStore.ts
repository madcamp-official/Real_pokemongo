import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/store/storage';
import { fetchGardenLayout, saveGardenLayout } from '@/api/garden';
import type { GardenTile, Placement } from '@/types/api';

/**
 * 홈 가든 배치 상태 (F16). 로컬 우선 저장 후 서버 동기화.
 * - tiles: 배경 타일 맵(서버 기본값 로드)
 * - placements: 사용자 배치(로컬 우선 — 다중 기기 충돌은 서버 기준 병합 정책을 따르되
 *   Phase 5에서는 로컬 저장 + PUT 동기화까지만 구현)
 * - nicknames: 작명 결과 로컬 오버라이드(도감 creature.nickname 보다 우선)
 */
interface GardenState {
  tiles: GardenTile[];
  placements: Placement[];
  nicknames: Record<string, string>;
  hasLoaded: boolean;
  syncing: boolean;

  loadFromServer: () => Promise<void>;
  placeCreature: (p: Placement) => boolean;
  removeCreature: (creatureId: string) => void;
  setNickname: (creatureId: string, name: string) => void;
  syncToServer: () => Promise<void>;
}

export const useGardenStore = create<GardenState>()(
  persist(
    (set, get) => ({
      tiles: [],
      placements: [],
      nicknames: {},
      hasLoaded: false,
      syncing: false,

      loadFromServer: async () => {
        // 배경 타일이 이미 있으면(로컬 보관) 서버 재로딩 없이 사용.
        if (get().tiles.length > 0) {
          set({ hasLoaded: true });
          return;
        }
        try {
          const layout = await fetchGardenLayout();
          set((s) => ({
            tiles: layout.tiles,
            // 로컬 배치가 없을 때만 서버 배치를 채택(로컬 우선).
            placements: s.placements.length > 0 ? s.placements : layout.placements,
            hasLoaded: true,
          }));
        } catch {
          set({ hasLoaded: true });
        }
      },

      placeCreature: (p) => {
        const { placements } = get();
        // 한 타일에는 한 개체만.
        const occupied = placements.some((x) => x.row === p.row && x.col === p.col);
        if (occupied) return false;
        // 같은 개체가 이미 배치돼 있으면 제거 후 재배치(이동).
        const rest = placements.filter((x) => x.creature_id !== p.creature_id);
        set({ placements: [...rest, p] });
        void get().syncToServer();
        return true;
      },

      removeCreature: (creatureId) => {
        set((s) => ({
          placements: s.placements.filter((x) => x.creature_id !== creatureId),
        }));
        void get().syncToServer();
      },

      setNickname: (creatureId, name) =>
        set((s) => ({ nicknames: { ...s.nicknames, [creatureId]: name } })),

      syncToServer: async () => {
        if (get().syncing) return;
        set({ syncing: true });
        try {
          await saveGardenLayout({ tiles: get().tiles, placements: get().placements });
        } catch {
          // 동기화 실패는 무시 — 로컬이 원본이며 다음 변경 시 재시도된다.
        } finally {
          set({ syncing: false });
        }
      },
    }),
    {
      name: 'living-dex-garden',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({
        tiles: s.tiles,
        placements: s.placements,
        nicknames: s.nicknames,
      }),
    }
  )
);
