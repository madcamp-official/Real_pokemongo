import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * zustand persist 용 스토리지 어댑터.
 *
 * Phase 0에서는 AsyncStorage 를 사용한다 (Expo Go / web 포함 어디서나 동작).
 * 성능이 중요한 데이터가 늘어나면 dev build 전환 후 react-native-mmkv 로
 * 교체 가능하도록 이 파일의 구현만 바꾸면 되게 추상화해 둔다.
 *
 * ⚠️ 로그인 토큰은 Phase 2에서 expo-secure-store 로 별도 이관 예정.
 */
export const zustandStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};
