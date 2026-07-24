import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { colors } from '@/theme/colors';
import type { RootTabParamList } from '@/navigation/types';
import CameraScreen from '@/screens/CameraScreen';
import DexScreen from '@/screens/DexScreen';
import GardenScreen from '@/screens/GardenScreen';
import SettingsScreen from '@/screens/SettingsScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

// 아이콘 라이브러리는 Phase 1에서 도입. 지금은 이모지로 대체.
const tabEmoji: Record<keyof RootTabParamList, string> = {
  Camera: '📷',
  Dex: '📖',
  Garden: '🌿',
  Settings: '⚙️',
};

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: colors.primary,
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: focused ? 22 : 18 }}>{tabEmoji[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Camera" component={CameraScreen} options={{ title: '촬영' }} />
      <Tab.Screen name="Dex" component={DexScreen} options={{ title: '도감' }} />
      <Tab.Screen name="Garden" component={GardenScreen} options={{ title: '홈 가든' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}
