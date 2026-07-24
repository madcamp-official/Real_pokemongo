/** 식별자 생성 유틸. 브랜디드 타입으로 캐스팅해 반환한다. */
import { randomUUID } from "node:crypto";
import type {
  GuardianId,
  ChildId,
  ObservationId,
  TaxonId,
  QuestId,
  BadgeId,
  MediaRef,
} from "./types.js";

export const newGuardianId = () => randomUUID() as GuardianId;
export const newChildId = () => randomUUID() as ChildId;
export const newObservationId = () => randomUUID() as ObservationId;
export const newTaxonId = () => randomUUID() as TaxonId;
export const newQuestId = () => randomUUID() as QuestId;
export const newBadgeId = () => randomUUID() as BadgeId;
export const asMediaRef = (s: string) => s as MediaRef;
export const asTaxonId = (s: string) => s as TaxonId;
