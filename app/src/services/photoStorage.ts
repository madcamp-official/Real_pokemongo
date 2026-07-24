import { Directory, File, Paths } from 'expo-file-system';

/**
 * 촬영 원본의 로컬 임시 저장 (F2).
 *
 * takePictureAsync / image-picker 가 돌려주는 uri 는 캐시 영역이라 시스템에 의해
 * 지워질 수 있다. 업로드 큐가 앱 재시작 후에도 살아남으려면 document 영역으로
 * 복사해 두고, 업로드 성공 후 정리한다.
 *
 * Expo SDK 57 의 객체지향 FileSystem API(File/Directory/Paths) 사용.
 */

const SIGHTINGS_SUBDIR = 'sightings';

function sightingsDir(): Directory {
  const dir = new Directory(Paths.document, SIGHTINGS_SUBDIR);
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

/** 캐시의 촬영본을 영구 저장 영역으로 복사하고 새 uri 를 반환한다. */
export async function persistPhoto(sourceUri: string, filename: string): Promise<string> {
  const dir = sightingsDir();
  const source = new File(sourceUri);
  const dest = new File(dir, filename);
  if (dest.exists) {
    dest.delete();
  }
  await source.copy(dest);
  return dest.uri;
}

/** 업로드 완료 후 로컬 임시본 정리 (F2: 업로드 후 로컬 캐시 정리 정책). */
export function deletePersistedPhotos(uris: string[]): void {
  for (const uri of uris) {
    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // 정리는 best-effort — 실패해도 큐 진행을 막지 않는다.
    }
  }
}
