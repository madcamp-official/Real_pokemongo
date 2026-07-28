/**
 * 관찰 서비스 (명세서 F9 + §8: 범용 관찰 레코드).
 *
 * 관찰 레코드를 생성/저장한다. `region`(일반화 값)은 resolveRegionForStorage 를 통해서만
 * 들어온다(동의 게이트 유지). `preciseCoord`는 D단계 제품 결정으로 동의와 무관하게 호출부가
 * 그대로 전달한다 — 이 서비스는 둘 다 받은 그대로 저장할 뿐, 정책 판단은 호출부(ObservationFlow)
 * 책임이다.
 *
 * 일일 동정 한도(무료 사용자) 체크도 여기서 제공(명세서 §15, config.freeDailyLimit).
 */
import type {
  UserId,
  Observation,
  ObservationId,
  ObservationModality,
  ObservedRegion,
  PreciseCoordinate,
  TaxonId,
  TaxonRank,
  MediaRef,
} from "../domain/types.js";
import { newObservationId } from "../domain/ids.js";
import type { ObservationRepository } from "../repositories/ports.js";

export interface CreateObservationInput {
  userId: UserId;
  taxonId: TaxonId | null;
  taxonRank: TaxonRank | null;
  media: MediaRef[];
  confidence: number;
  source: string;
  region: ObservedRegion | null; // 이미 일반화된 값 또는 null(동의 게이트)
  preciseCoord: PreciseCoordinate | null; // D단계: 동의와 무관하게 항상 저장(호출부가 이미 결정)
  note?: string;
  now?: Date;
  /** 5단계 — 생략하면 기존 사진 흐름과 동일하게 "photo"(기존 호출부는 안 바꿔도 됨). */
  modality?: ObservationModality;
}

export class ObservationService {
  constructor(private readonly repo: ObservationRepository) {}

  async record(input: CreateObservationInput): Promise<Observation> {
    const obs: Observation = {
      id: newObservationId(),
      userId: input.userId,
      taxonId: input.taxonId,
      taxonRank: input.taxonRank,
      timestamp: (input.now ?? new Date()).toISOString(),
      modality: input.modality ?? "photo",
      region: input.region, // null 이거나 시·군·구 수준
      preciseCoord: input.preciseCoord,
      media: input.media,
      confidence: input.confidence,
      source: input.source,
      note: input.note,
    };
    await this.repo.save(obs);
    return obs;
  }

  listByUser(userId: UserId): Promise<Observation[]> {
    return this.repo.listByUser(userId);
  }

  /**
   * 오늘(로컬 자정 기준 근사: UTC 24h) 동정 횟수. 무료 사용자 한도 체크용.
   * limit=0 이면 무제한.
   */
  async isWithinDailyLimit(
    userId: UserId,
    limit: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (limit <= 0) return true;
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await this.repo.listByUserSince(userId, since);
    return recent.length < limit;
  }

  get(id: ObservationId): Promise<Observation | null> {
    return this.repo.get(id);
  }
}
