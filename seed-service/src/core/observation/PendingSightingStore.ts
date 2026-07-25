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
import type { RawCoordinate } from "./regionGeneralizer.js";
import type { IdentificationOutcome } from "../identification/IdentificationGateway.js";

export interface PendingSighting {
  id: SightingId;
  userId: UserId;
  images: SanitizedImage[];
  rawCoord?: RawCoordinate;
  createdAt: string;
  /** POST /identify가 계산해 매달아둔 결과 — POST /identify/confirm이 재추론 없이 재사용. */
  identification?: IdentificationOutcome;
}

export class PendingSightingStore {
  private m = new Map<string, PendingSighting>();

  create(userId: UserId, images: SanitizedImage[], rawCoord?: RawCoordinate): PendingSighting {
    const sighting: PendingSighting = {
      id: newSightingId(),
      userId,
      images,
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
