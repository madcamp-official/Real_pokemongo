import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { RootTabParamList } from '@/navigation/types';
import CameraScreen from '@/screens/CameraScreen';
import SoundScreen from '@/screens/SoundScreen';
import DexScreen from '@/screens/DexScreen';
import GardenScreen from '@/screens/GardenScreen';
import MapScreen from '@/screens/MapScreen';
import RewardsScreen from '@/screens/RewardsScreen';
import SettingsScreen from '@/screens/SettingsScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

/**
 * 메인 내비게이션.
 *
 * 하단 탭 바와 헤더는 쓰지 않는다 — 지도가 홈이고, 나머지 화면은 지도 하단 중앙의
 * 엠블럼을 눌러 펼쳐지는 방사형 메뉴(RadialMenu)로 이동한다(포켓몬고식).
 * 그럼에도 탭 내비게이터를 유지하는 이유: 화면 전환 시 각 탭의 상태(도감 필터, 가든
 * 배치 등)가 보존되고, 하드웨어 뒤로가기가 항상 지도로 돌아오게 만들 수 있다.
 */
export function MainTabs() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  return (
    <Tab.Navigator
      initialRouteName="Map"
      backBehavior="initialRoute"
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Camera" component={CameraScreen} />
      <Tab.Screen name="Sound" component={SoundScreen} />
      <Tab.Screen name="Dex" component={DexScreen} />
      <Tab.Screen name="Garden" component={GardenScreen} />
      <Tab.Screen name="Rewards" component={RewardsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
