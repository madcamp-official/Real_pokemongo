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
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { asMediaRef } from "../domain/ids.js";
import type { MediaRef } from "../domain/types.js";
import type { SanitizedImage } from "./MediaSanitizer.js";

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
}
