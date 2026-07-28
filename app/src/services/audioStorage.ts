import { File } from 'expo-file-system';

/** 앱이 미확정 소리 녹음을 폐기하거나 업로드 완료 후 정리할 때 사용한다. */
export function deleteRecordedAudio(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 정리는 best-effort다. 파일 삭제 실패가 녹음 화면을 막으면 안 된다.
  }
}
