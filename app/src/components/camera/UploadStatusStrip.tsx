import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUploadQueue } from '@/store/uploadQueueStore';

/**
 * 업로드 큐 상태 요약 스트립 (F2).
 * 진행 중/실패 건수를 보여주고, 실패 항목은 탭으로 재시도한다.
 */
export function UploadStatusStrip() {
  const items = useUploadQueue((s) => s.items);
  const retryAllFailed = useUploadQueue((s) => s.retryAllFailed);

  const pending = items.filter(
    (i) => i.status === 'pending' || i.status === 'uploading'
  ).length;
  const failed = items.filter(
    (i) => i.status === 'failed' && i.attempts >= 3
  ).length;
  const done = items.filter((i) => i.status === 'done').length;

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      {pending > 0 && (
        <Text style={styles.text}>업로드 중 {pending}건</Text>
      )}
      {done > 0 && pending === 0 && failed === 0 && (
        <Text style={styles.text}>업로드 완료 {done}건 ✓</Text>
      )}
      {failed > 0 && (
        <Pressable onPress={retryAllFailed} style={styles.retry}>
          <Text style={styles.retryText}>실패 {failed}건 · 다시 시도</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    alignSelf: 'center',
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
  retry: {
    backgroundColor: '#C0453B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
