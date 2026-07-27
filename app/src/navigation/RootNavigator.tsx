import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { startGuestSession } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { MainTabs } from '@/navigation/MainTabs';
import TutorialScreen from '@/screens/onboarding/TutorialScreen';
import ChoiceScreen from '@/screens/onboarding/ChoiceScreen';
import LoginScreen from '@/screens/onboarding/LoginScreen';
import ConsentScreen from '@/screens/onboarding/ConsentScreen';
import SignupScreen from '@/screens/onboarding/SignupScreen';
import SpeciesCardScreen from '@/screens/dex/SpeciesCardScreen';
import PhotoViewerScreen from '@/screens/dex/PhotoViewerScreen';
import IdentifyResultScreen from '@/screens/identify/IdentifyResultScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const hasHydratedStore = useAuthStore((s) => s.hasHydratedStore);
  const hasHydratedToken = useAuthStore((s) => s.hasHydratedToken);
  const onboardingComplete = useAuthStore((s) => s.onboardingComplete);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isGuest = useAuthStore((s) => s.isGuest);
  const hydrateToken = useAuthStore((s) => s.hydrateToken);
  const startGuest = useAuthStore((s) => s.startGuest);
  const guestRepairAttempted = useRef(false);

  useEffect(() => {
    void hydrateToken();
  }, [hydrateToken]);

  // 게스트인데 토큰이 없는 세션을 자동 복구한다.
  // 예전에는 게스트가 서버 세션 없이 시작돼서 /dex·/map/pins·/sightings/upload가 전부
  // 401이 났고, 화면에는 "서버에 연결하지 못했어요"로 보였다. 이미 그 상태로 저장된
  // 기기는 재설치 없이는 못 빠져나오므로 여기서 세션을 새로 받아 붙인다.
  useEffect(() => {
    if (!hasHydratedStore || !hasHydratedToken) return;
    if (!isGuest || accessToken || guestRepairAttempted.current) return;
    guestRepairAttempted.current = true;
    void startGuestSession()
      .then((session) => startGuest(session.access_token, session.user))
      .catch(() => {
        // 서버에 못 닿으면 다음 실행 때 다시 시도한다(로컬 게스트로는 계속 사용 가능).
        guestRepairAttempted.current = false;
      });
  }, [hasHydratedStore, hasHydratedToken, isGuest, accessToken, startGuest]);

  // zustand persist 재수화(로컬 상태) + secure-store 토큰 복원이 끝날 때까지 대기.
  // 대기 없이 렌더하면 재방문 사용자에게 튜토리얼이 잠깐 다시 보이는 깜빡임이 생긴다.
  if (!hasHydratedStore || !hasHydratedToken) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F9F4' }}>
        <ActivityIndicator color="#5B8C3E" />
      </View>
    );
  }

  // 튜토리얼을 아직 못 봤으면 Tutorial, 이미 봤지만 로그아웃 상태(세션도 게스트도 아님)면
  // Choice(재로그인/게스트 재시작 선택)로, 세션이 살아있으면 바로 Main으로 보낸다.
  const hasActiveSession = !!accessToken || isGuest;
  const initialRouteName = !onboardingComplete
    ? 'Tutorial'
    : hasActiveSession
      ? 'Main'
      : 'Choice';

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Tutorial" component={TutorialScreen} />
        <Stack.Screen name="Choice" component={ChoiceScreen} />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: true, title: '로그인' }}
        />
        <Stack.Screen
          name="Consent"
          component={ConsentScreen}
          options={{ headerShown: true, title: '동의' }}
        />
        <Stack.Screen
          name="Signup"
          component={SignupScreen}
          options={{ headerShown: true, title: '계정 만들기' }}
        />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="SpeciesCard"
          component={SpeciesCardScreen}
          options={{ headerShown: false, presentation: 'card' }}
        />
        <Stack.Screen
          name="IdentifyResult"
          component={IdentifyResultScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        <Stack.Screen
          name="PhotoViewer"
          component={PhotoViewerScreen}
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
