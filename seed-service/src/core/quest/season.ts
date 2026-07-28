/**
 * 실제 달력 날짜 → 계절 판정 (F7 계절 퀘스트가 "지금 몇 월인지"를 반영하기 위함).
 *
 * 반드시 Asia/Seoul 기준으로 월/일을 계산한다 — 서버가 어느 시간대에서 돌든(클라우드는
 * 보통 UTC) 한국 사용자 기준 "지금 몇 월"과 어긋나면 안 된다. 한국은 DST가 없어
 * 고정 UTC+9로 계산해도 항상 정확하다.
 *
 * 판정 기준(제품 결정): 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울.
 */
import type { Season } from "../domain/types.js";

/** Asia/Seoul 기준 "YYYY-MM-DD". 일일 콘텐츠(데일리 퀘스트) 키로도 쓰인다. */
export function seoulDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function seasonForDate(now: Date = new Date()): Season {
  const month = Number(seoulDateKey(now).slice(5, 7));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/** Asia/Seoul 기준 해당 날짜의 00:00:00.000~23:59:59.999 를 UTC ISO 문자열로. */
export function seoulDayRangeIso(now: Date = new Date()): { from: string; to: string } {
  const dateKey = seoulDateKey(now);
  return {
    from: new Date(`${dateKey}T00:00:00.000+09:00`).toISOString(),
    to: new Date(`${dateKey}T23:59:59.999+09:00`).toISOString(),
  };
}
