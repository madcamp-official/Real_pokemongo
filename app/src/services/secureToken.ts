import * as SecureStore from 'expo-secure-store';

/**
 * 로그인 토큰 전용 보관소 (F1/F18).
 * 일반 상태(zustand persist → AsyncStorage)와 분리해, OS 키체인/키스토어를 쓰는
 * expo-secure-store 에 별도 저장한다. authStore 는 accessToken 을 메모리에만
 * 들고, 앱 시작 시 이 모듈로 복원(hydrate)한다.
 */
const KEY = 'living-dex-access-token';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // 저장 실패해도 로그인 자체는 진행 — 다음 실행 시 재로그인 요구로 귀결.
  }
}

export async function clearStoredToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // no-op
  }
}
