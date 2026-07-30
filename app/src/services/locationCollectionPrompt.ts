import { Alert } from 'react-native';
import { updatePrivacySettings } from '@/api/account';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * 첫 촬영/녹음 시점에 위치 수집 여부를 한 번 물어본다(2026-07-30).
 *
 * 게스트 온보딩은 위치 동의 화면(ConsentScreen)을 거치지 않아
 * locationCollectionEnabled가 계속 기본값(false)으로 남았고, 그 결과 촬영/녹음을
 * 아무리 반복해도 좌표가 전송되지 않아 지도에 핀이 영영 뜨지 않았다. 이미 설정을
 * 정해둔 사용자(토글 on/off든, 정식 동의 화면을 거쳤든)에게는 절대 다시 묻지 않는다 —
 * `locationCollectionEnabled`가 이미 true 거나, `hasPromptedLocationCollection`이
 * true 면 즉시 반환한다.
 *
 * @returns 이번 촬영/녹음에 위치를 첨부해도 되면 true, 아니면 false.
 */
export async function maybePromptLocationCollection(): Promise<boolean> {
  const state = useSettingsStore.getState();
  if (state.locationCollectionEnabled) return true;
  if (state.hasPromptedLocationCollection) return false;

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      '위치를 지도에 남길까요?',
      '발견한 곳을 지도에 표시할 수 있어요. 정확한 좌표 대신 흐릿하게 처리되고, 언제든 설정에서 끌 수 있어요.',
      [
        {
          text: '다음에',
          style: 'cancel',
          onPress: () => {
            useSettingsStore.getState().setHasPromptedLocationCollection(true);
            resolve(false);
          },
        },
        {
          text: '켜기',
          onPress: () => {
            useSettingsStore.getState().setLocationCollectionEnabled(true);
            useSettingsStore.getState().setHasPromptedLocationCollection(true);
            void updatePrivacySettings({
              location: true,
              photo: useSettingsStore.getState().photoCollectionEnabled,
            }).catch(() => {
              // 서버 동기화가 실패해도 로컬 설정은 이미 켜졌으니 이번 촬영엔 좌표를 담는다.
              // 다음에 설정 화면을 열면(privacyQuery) 서버 값으로 다시 맞춰진다.
            });
            resolve(true);
          },
        },
      ],
      { cancelable: false },
    );
  });
}
