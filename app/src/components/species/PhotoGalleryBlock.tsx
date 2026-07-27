import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchSpeciesPhotos, toMediaUrl } from '@/api/species';
import { colors } from '@/theme/colors';
import type { RootStackParamList } from '@/navigation/types';

/**
 * F6 종 카드 하단 "지금까지 찍은 사진" 갤러리.
 * 사진 한 장이 화면의 3/4 이상을 차지하도록 크게 보여주고, 가로로 스와이프해 넘겨본다.
 * 탭하면 PhotoViewer(전체화면)로 넘어간다. 촬영한 사진이 없으면 섹션 자체를 숨긴다
 * (observe_points/quiz 등 이 화면의 다른 섹션들과 같은 관례).
 */
export function PhotoGalleryBlock({ speciesId }: { speciesId: string }) {
  const { width, height } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [index, setIndex] = useState(0);

  const { data: photos } = useQuery({
    queryKey: ['species', speciesId, 'photos'],
    queryFn: () => fetchSpeciesPhotos(speciesId),
  });

  if (!photos || photos.length === 0) return null;

  const itemHeight = Math.round(height * 0.75);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>📸 지금까지 찍은 사진</Text>
      <View>
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.observation_id}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => (
            <Pressable
              style={{ width, height: itemHeight }}
              onPress={() => navigation.navigate('PhotoViewer', { speciesId, initialIndex: i })}
            >
              <Image
                source={{ uri: toMediaUrl(item.url) }}
                style={styles.photo}
                resizeMode="cover"
              />
            </Pressable>
          )}
        />
        {photos.length > 1 && (
          <View style={styles.counterPill}>
            <Text style={styles.counterText}>
              {index + 1} / {photos.length}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: 20 },
  photo: { width: '100%', height: '100%' },
  counterPill: {
    position: 'absolute',
    right: 32,
    bottom: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  counterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
