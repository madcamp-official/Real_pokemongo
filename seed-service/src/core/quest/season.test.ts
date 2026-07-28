import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonForDate, seoulDateKey, seoulDayRangeIso } from "./season.js";

test("seasonForDate: 월별 경계값이 명세(3~5봄/6~8여름/9~11가을/12~2겨울)와 일치한다", () => {
  const cases: [string, string][] = [
    ["2026-03-01T00:00:00+09:00", "spring"],
    ["2026-04-15T00:00:00+09:00", "spring"],
    ["2026-05-31T23:59:59+09:00", "spring"],
    ["2026-06-01T00:00:00+09:00", "summer"],
    ["2026-08-31T23:59:59+09:00", "summer"],
    ["2026-09-01T00:00:00+09:00", "autumn"],
    ["2026-11-30T23:59:59+09:00", "autumn"],
    ["2026-12-01T00:00:00+09:00", "winter"],
    ["2026-01-15T00:00:00+09:00", "winter"],
    ["2026-02-28T23:59:59+09:00", "winter"],
  ];
  for (const [iso, expected] of cases) {
    assert.equal(seasonForDate(new Date(iso)), expected, iso);
  }
});

test("seasonForDate: UTC 시각이 Asia/Seoul 기준 날짜 경계를 넘기면 그 경계를 따른다", () => {
  // UTC 2026-02-28T15:30 = Asia/Seoul 2026-03-01T00:30 (다음날, 봄)
  const crossing = new Date("2026-02-28T15:30:00.000Z");
  assert.equal(seasonForDate(crossing), "spring");
});

test("seoulDateKey: Asia/Seoul 날짜를 YYYY-MM-DD로 반환한다", () => {
  assert.equal(seoulDateKey(new Date("2026-02-28T15:30:00.000Z")), "2026-03-01");
  assert.equal(seoulDateKey(new Date("2026-07-28T10:00:00.000Z")), "2026-07-28");
});

test("seoulDayRangeIso: 하루의 시작·끝을 UTC ISO로 정확히 변환한다", () => {
  const { from, to } = seoulDayRangeIso(new Date("2026-07-28T10:00:00.000Z"));
  assert.equal(from, "2026-07-27T15:00:00.000Z"); // 2026-07-28T00:00+09:00
  assert.equal(to, "2026-07-28T14:59:59.999Z"); // 2026-07-28T23:59:59.999+09:00
});
