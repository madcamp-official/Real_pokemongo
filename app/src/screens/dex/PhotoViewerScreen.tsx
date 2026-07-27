import { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { fetchSpeciesPhotos, toMediaUrl } from '@/api/species';
import type { RootStackParamList } from '@/navigation/types';
import type { SpeciesPhoto } from '@/types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'PhotoViewer'>;

/**
 * F6 사진 전체화면 뷰어.
 * 사진 영역이 화면 대부분을 차지하고, 하단에는 뒤로가기 버튼만 있는 고정 바를 둔다.
 * 좌우로 스와이프하며 같은 종의 다른 사진으로 넘어간다(PhotoGalleryBlock과 같은 쿼리
 * 캐시를 써서, 이미 화면에 들어와 있던 목록이면 추가 요청 없이 즉시 뜬다).
 */
export default function PhotoViewerScreen({ navigation, route }: Props) {
  const { speciesId, initialIndex } = route.params;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  const { data: photos } = useQuery({
    queryKey: ['species', speciesId, 'photos'],
    queryFn: () => fetchSpeciesPhotos(speciesId),
  });

  const backBarHeight = 64 + insets.bottom;
  const photoAreaHeight = height - backBarHeight;

  return (
    <View style={styles.root}>
      <FlatList
        data={photos ?? []}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(item) => item.observation_id}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }: { item: SpeciesPhoto }) => (
          <View style={{ width, height: photoAreaHeight }}>
            <Image
              source={{ uri: toMediaUrl(item.url) }}
              style={styles.photo}
              resizeMode="contain"
            />
          </View>
        )}
      />

      {photos && photos.length > 1 && (
        <View style={[styles.counterPill, { top: insets.top + 12 }]}>
          <Text style={styles.counterText}>
            {index + 1} / {photos.length}
          </Text>
        </View>
      )}

      <View style={[styles.backBar, { height: backBarHeight, paddingBottom: insets.bottom }]}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹ 뒤로가기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  photo: { width: '100%', height: '100%' },

  counterPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  counterText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  backBar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
