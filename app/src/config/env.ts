import Constants from 'expo-constants';

/** 백엔드가 떠 있는 포트. */
const API_PORT = 8080;

/**
 * Metro dev server 호스트(= PC의 LAN IP)를 찾는다.
 *
 * Expo Go에서 이 값이 어느 필드에 담기는지는 SDK/런타임 조합에 따라 다르다 —
 * 하나만 믿으면 undefined 로 떨어져 localhost 로 폴백하고, 실기기에서는 localhost 가
 * 폰 자신을 가리켜 모든 API가 ERR_CONNECTION_REFUSED 로 죽는다. 그래서 알려진
 * 위치를 순서대로 훑고, 폰 자신을 가리키는 값은 후보에서 제외한다.
 */
function resolveDevHost(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    try {
      // hostUri/debuggerHost는 보통 "10.0.1.5:8081" 형태지만 런타임에 따라
      // scheme/path가 붙을 수도 있다. URL 파서로 안전하게 hostname만 꺼낸다.
      const url = new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
      const host = url.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') return host;
    } catch {
      // 해석할 수 없는 런타임 메타데이터는 다음 후보로 넘긴다.
    }
  }
  return null;
}

/**
 * 백엔드 base URL 결정.
 * app.json 의 `extra.apiBaseUrl` 을 채우면 그 값이 항상 우선한다(자동 탐지 실패 시 탈출구).
 */
function resolveApiBaseUrl(): string {
  // Expo CLI가 .env.local의 EXPO_PUBLIC_* 값을 번들에 정적으로 주입한다.
  // 실기기 테스트에서는 PC의 Wi-Fi 주소를 명시해 Metro 메타데이터 형식이 달라져도
  // 휴대폰이 자기 자신의 localhost를 바라보지 않게 한다.
  const envOverride = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envOverride) return envOverride.replace(/\/+$/, '');

  const override = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof override === 'string' && override.length > 0) return override.replace(/\/+$/, '');

  const host = resolveDevHost();
  return host ? `http://${host}:${API_PORT}` : `http://localhost:${API_PORT}`;
}

/**
 * 환경 설정.
 * 실제 서버 연동 시 USE_MOCK=false 로 두고 API_BASE_URL 을 지정한다.
 */
export const env = {
  /** 실제 백엔드 대신 로컬 mock 응답을 사용할지 여부 */
  USE_MOCK: false,
  /** 백엔드 API base URL (USE_MOCK=false 일 때 사용) */
  API_BASE_URL: resolveApiBaseUrl(),
  /** 네트워크 요청 타임아웃 (ms) — 리스크 1(네트워크 불안정) 대응 */
  REQUEST_TIMEOUT: 15000,
} as const;
