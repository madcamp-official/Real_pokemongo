/**
 * 업로드~동정확정 사이 임시 상태 (C단계).
 *
 * `POST /sightings/upload`가 만들고, `POST /identify`가 채우고, `POST /identify/confirm`이
 * 소비한다. 의도적으로 정식 Repository 포트(ports.ts)로 formalize하지 않았다 — 영속
 * 도메인 데이터가 아니라 "지금 진행 중인 업로드"라는 세션 성격의 상태라, 다른
 * InMemory*Repo(관찰/도감/퀘스트 등 영구 기록)와는 삭제권(§5.6) 대상도 아니다. 프로세스
 * 재시작으로 사라져도 사용자는 다시 업로드하면 될 뿐 데이터 유실이 아니다.
 */
import { newSightingId } from "../domain/ids.js";
import type { SightingId, UserId } from "../domain/types.js";
import type { SanitizedImage } from "../media/MediaSanitizer.js";
import type { EnhancementReport } from "../media/ImageEnhancer.js";
import type { RawCoordinate } from "./regionGeneralizer.js";
import type { IdentificationOutcome } from "../identification/IdentificationGateway.js";

export interface PendingSighting {
  id: SightingId;
  userId: UserId;
  /** 정화(EXIF 제거)만 거친 원본 프레임 — F3 보정 전. 확정(confirm) 시 저장하지 않는다(원본 폐기 정책). */
  images: SanitizedImage[];
  /** F3(사진 보정)가 여러 프레임을 병합·보정해서 만든 대표 이미지 1장. /identify와 최종 저장은 이걸 쓴다. */
  enhanced: SanitizedImage;
  enhancement: EnhancementReport;
  rawCoord?: RawCoordinate;
  createdAt: string;
  /** POST /identify가 계산해 매달아둔 결과 — POST /identify/confirm이 재추론 없이 재사용. */
  identification?: IdentificationOutcome;
}

export class PendingSightingStore {
  private m = new Map<string, PendingSighting>();

  create(
    userId: UserId,
    images: SanitizedImage[],
    enhanced: SanitizedImage,
    enhancement: EnhancementReport,
    rawCoord?: RawCoordinate,
  ): PendingSighting {
    const sighting: PendingSighting = {
      id: newSightingId(),
      userId,
      images,
      enhanced,
      enhancement,
      rawCoord,
      createdAt: new Date().toISOString(),
    };
    this.m.set(sighting.id, sighting);
    return sighting;
  }

  get(id: SightingId): PendingSighting | null {
    return this.m.get(id) ?? null;
  }

  attachIdentification(id: SightingId, outcome: IdentificationOutcome): void {
    const sighting = this.m.get(id);
    if (sighting) sighting.identification = outcome;
  }

  /** 확정(confirm) 후 소비 — 같은 sighting으로 재확정하는 것을 막는다. */
  consume(id: SightingId): void {
    this.m.delete(id);
  }
}
