/**
 * 로컬 디스크 미디어 저장소 (C단계 MVP 스텁).
 *
 * 명세서상 실제 오브젝트 스토리지(S3 등)가 정해지기 전까지, 사진을 로컬 디스크에 저장한다.
 * 의도적으로 클라우드/과금 서비스를 전혀 쓰지 않는다(사용자 지시: 유료 API 사용 방지) —
 * `config.mediaStorage.bucket` 등이 채워지면 그때 실제 어댑터로 교체한다(TODO, 기존
 * config/index.ts에 이미 표시돼 있음).
 *
 * 정화(sanitizeImage)를 거친 바이트만 받는다 — 호출부가 SanitizedImage 타입을 넘기게
 * 강제해서, 원본(EXIF 포함) 바이트가 실수로 저장되는 걸 타입 수준에서 막는다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { asMediaRef } from "../domain/ids.js";
import type { MediaRef } from "../domain/types.js";
import type { SanitizedImage } from "./MediaSanitizer.js";

const LOCAL_PREFIX = "local://";

export class LocalDiskMediaStore {
  constructor(private readonly baseDir: string) {}

  async save(image: SanitizedImage): Promise<MediaRef> {
    await mkdir(this.baseDir, { recursive: true });
    // 확장자는 굳이 구분하지 않는다 — MediaRef는 서버 내부 전용 불투명 참조라 의미 없음.
    const filename = `${randomUUID()}.bin`;
    await writeFile(join(this.baseDir, filename), image);
    // 이 참조는 서버 내부에서만 의미 있는 불투명 문자열이다(클라이언트는 해석하지 않음).
    return asMediaRef(`local://${filename}`);
  }

  /**
   * F6 도감 상세의 "지금까지 찍은 사진" 갤러리용 — save()가 돌려준 불투명 참조로
   * 저장된 바이트를 다시 읽어온다. training_samples/ 등 save()가 만들지 않은 경로는
   * 애초에 이 참조 형식(local://)으로 가리킬 수 없다.
   */
  async read(ref: MediaRef): Promise<Uint8Array | null> {
    if (!ref.startsWith(LOCAL_PREFIX)) return null;
    const filename = ref.slice(LOCAL_PREFIX.length);
    try {
      return await readFile(join(this.baseDir, filename));
    } catch {
      return null;
    }
  }

  /**
   * F3 "향후 모델 재학습용 데이터 수집 파이프라인" — `photo` 동의가 있고, 보정기가
   * 저품질(재촬영 권장)로 판단한 프레임만 별도 하위 디렉터리에 보관한다(전량 수집이
   * 아니라 개선에 실제로 쓸모 있는 표본만, 저장 비용·프라이버시 노출면을 최소화하려는
   * 의도적 스코프 결정). 이 메서드가 실패해도 업로드 응답에 절대 영향을 주면 안 된다 —
   * 호출부(sightings.routes.ts)가 결과를 무시하고 로그만 남긴다.
   */
  async saveTrainingSample(image: SanitizedImage, reason: string): Promise<void> {
    const dir = join(this.baseDir, "training_samples");
    await mkdir(dir, { recursive: true });
    const filename = `${Date.now()}_${reason}_${randomUUID()}.bin`;
    await writeFile(join(dir, filename), image);
  }
}
