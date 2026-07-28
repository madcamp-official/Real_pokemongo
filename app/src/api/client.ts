import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { useAuthStore } from '@/store/authStore';
import { attachMockAdapter } from '@/mocks/mockAdapter';
import type { SignupResponse } from '@/types/api';

/**
 * 공용 axios 인스턴스.
 * - 요청 인터셉터: 인증 토큰 자동 주입
 * - USE_MOCK=true 이면 mock 어댑터를 붙여 로컬 응답을 반환
 */
export const apiClient = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: env.REQUEST_TIMEOUT,
});

type GuestRetryConfig = InternalAxiosRequestConfig & {
  _guestSessionRetry?: boolean;
};

let guestSessionRecovery: Promise<string> | null = null;

/**
 * 개발 서버가 InMemory 모드로 재시작되면 기존 게스트 토큰의 서명은 유효해도 해당
 * 사용자 레코드가 사라져 401이 된다. 게스트에 한해 새 서버 세션을 한 번 발급해 원래
 * 요청을 재시도한다. 일반 계정은 임의로 새 계정을 만들면 안 되므로 이 경로를 타지 않는다.
 */
async function recoverGuestSession(): Promise<string> {
  if (!guestSessionRecovery) {
    guestSessionRecovery = axios
      .post<SignupResponse>(
        `${env.API_BASE_URL}/session/guest`,
        {},
        { timeout: env.REQUEST_TIMEOUT }
      )
      .then(({ data }) => {
        useAuthStore.getState().startGuest(data.access_token, data.user);
        return data.access_token;
      })
      .finally(() => {
        guestSessionRecovery = null;
      });
  }
  return guestSessionRecovery;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // React Native가 multipart boundary를 직접 붙일 수 있게 FormData 요청에서는
  // Content-Type을 비운다. boundary 없는 multipart/form-data나 application/json이
  // 남으면 Fastify가 파일 파트를 읽기 전에 400/415로 거부한다.
  if (config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const config = error.config as GuestRetryConfig | undefined;
    const auth = useAuthStore.getState();
    if (auth.isGuest && config && !config._guestSessionRetry) {
      config._guestSessionRetry = true;
      try {
        const token = await recoverGuestSession();
        config.headers.set('Authorization', `Bearer ${token}`);
        return apiClient.request(config);
      } catch {
        // 복구 자체가 실패하면 아래 공통 세션 정리로 수렴한다.
      }
    }

    useAuthStore.getState().clearSession();
    return Promise.reject(error);
  }
);

if (env.USE_MOCK) {
  attachMockAdapter(apiClient);
}
