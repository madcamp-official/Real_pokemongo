import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '@/store/storage';
import { uploadSighting } from '@/api/sightings';
import { deletePersistedPhotos } from '@/services/photoStorage';
import type { Coord } from '@/services/location';

/**
 * 서버 업로드 큐 (F2).
 * 리스크 1(네트워크 불안정) 대응: 업로드 실패 시 재시도(backoff)하고, 큐를 영속화해
 * 앱 재시작 후에도 미완료 업로드를 이어서 처리한다.
 */

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface UploadItem {
  id: string;
  /** document 영역에 영구 저장된 프레임 uri 들 (단일 1장 / 버스트 N장) */
  frameUris: string[];
  hasLocation: boolean;
  coord?: Coord;
  status: UploadStatus;
  attempts: number;
  sightingId?: string;
  error?: string;
  createdAt: number;
  /** 갤러리에서 불러온 사진인지(메타데이터 기반 지도 반영 1차 필터링에 사용) */
  fromGallery: boolean;
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1500;

interface UploadQueueState {
  items: UploadItem[];
  isProcessing: boolean;

  enqueue: (
    input: Omit<UploadItem, 'id' | 'status' | 'attempts' | 'createdAt'>
  ) => string;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
  retryItem: (id: string) => void;
  retryAllFailed: () => void;
  processQueue: () => Promise<void>;
}

function genId(): string {
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const useUploadQueue = create<UploadQueueState>()(
  persist(
    (set, get) => ({
      items: [],
      isProcessing: false,

      enqueue: (input) => {
        const id = genId();
        const item: UploadItem = {
          ...input,
          id,
          status: 'pending',
          attempts: 0,
          createdAt: Date.now(),
        };
        set((s) => ({ items: [...s.items, item] }));
        // fire-and-forget 처리 시작
        void get().processQueue();
        return id;
      },

      removeItem: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      clearCompleted: () =>
        set((s) => ({ items: s.items.filter((i) => i.status !== 'done') })),

      retryItem: (id) => {
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id
              ? { ...i, status: 'pending', attempts: 0, error: undefined }
              : i
          ),
        }));
        void get().processQueue();
      },

      retryAllFailed: () => {
        set((s) => ({
          items: s.items.map((i) =>
            i.status === 'failed'
              ? { ...i, status: 'pending', attempts: 0, error: undefined }
              : i
          ),
        }));
        void get().processQueue();
      },

      processQueue: async () => {
        if (get().isProcessing) return;
        set({ isProcessing: true });

        try {
          // 처리 대상: 아직 성공하지 않았고 재시도 한도가 남은 항목
          const isProcessable = (i: UploadItem) =>
            (i.status === 'pending' || i.status === 'failed') &&
            i.attempts < MAX_ATTEMPTS;

          let next = get().items.find(isProcessable);
          while (next) {
            const current = next;
            set((s) => ({
              items: s.items.map((i) =>
                i.id === current.id ? { ...i, status: 'uploading' } : i
              ),
            }));

            try {
              const res = await uploadSighting({
                frames: current.frameUris.map((uri, idx) => ({
                  uri,
                  name: `${current.id}_${idx}.jpg`,
                })),
                coord: current.hasLocation ? current.coord : null,
              });

              deletePersistedPhotos(current.frameUris);
              set((s) => ({
                items: s.items.map((i) =>
                  i.id === current.id
                    ? { ...i, status: 'done', sightingId: res.sighting_id }
                    : i
                ),
              }));
            } catch (err) {
              const attempts = current.attempts + 1;
              const message = err instanceof Error ? err.message : '업로드 실패';
              set((s) => ({
                items: s.items.map((i) =>
                  i.id === current.id
                    ? { ...i, status: 'failed', attempts, error: message }
                    : i
                ),
              }));
              if (attempts < MAX_ATTEMPTS) {
                await delay(BASE_BACKOFF_MS * attempts); // 선형 backoff
              }
            }

            next = get().items.find(isProcessable);
          }
        } finally {
          set({ isProcessing: false });
        }
      },
    }),
    {
      name: 'living-dex-upload-queue',
      storage: createJSONStorage(() => zustandStorage),
      // 처리 플래그는 영속화하지 않는다 (재시작 시 항상 idle 로 시작).
      partialize: (s) => ({ items: s.items }),
      // 업로드 도중 앱이 종료돼 'uploading' 으로 굳은 항목을 재시작 시 복구한다.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.items = state.items.map((i) =>
          i.status === 'uploading' ? { ...i, status: 'pending' } : i
        );
      },
    }
  )
);
