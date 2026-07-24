import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query 전역 클라이언트.
 * 리스크 1(네트워크 불안정) 대응으로 재시도/스테일 정책을 보수적으로 설정.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
