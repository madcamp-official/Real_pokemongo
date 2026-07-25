/** 식별자 생성 유틸. 브랜디드 타입으로 캐스팅해 반환한다. */
import { randomUUID } from "node:crypto";
import type {
  UserId,
  ObservationId,
  TaxonId,
  QuestId,
  BadgeId,
  MediaRef,
  SightingId,
  CreatureId,
} from "./types.js";

export const newUserId = () => randomUUID() as UserId;
export const newObservationId = () => randomUUID() as ObservationId;
export const newTaxonId = () => randomUUID() as TaxonId;
export const newQuestId = () => randomUUID() as QuestId;
export const newBadgeId = () => randomUUID() as BadgeId;
export const newSightingId = () => randomUUID() as SightingId;
export const newCreatureId = () => randomUUID() as CreatureId;
export const asCreatureId = (s: string) => s as CreatureId;
export const asMediaRef = (s: string) => s as MediaRef;
export const asTaxonId = (s: string) => s as TaxonId;
export const asSightingId = (s: string) => s as SightingId;
