import assert from "node:assert/strict";
import test from "node:test";
import { isReportRange, resolveRange } from "../lib/study-report";

test("isReportRange 只接受预设时间段", () => {
  assert.equal(isReportRange("today"), true);
  assert.equal(isReportRange("3d"), true);
  assert.equal(isReportRange("7d"), true);
  assert.equal(isReportRange("30d"), true);
  assert.equal(isReportRange("365d"), false);
  assert.equal(isReportRange(""), false);
  assert.equal(isReportRange(undefined), false);
});

test("resolveRange: today 从当天 0 点开始", () => {
  const now = new Date("2026-08-11T15:30:00");
  const { from, to } = resolveRange("today", now);
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  assert.equal(from.getDate(), now.getDate());
  assert.equal(to, now);
});

test("resolveRange: 近 N 天往前推 N 天", () => {
  const now = new Date("2026-08-11T15:30:00");
  const { from } = resolveRange("7d", now);
  assert.equal(Math.round((now.getTime() - from.getTime()) / 86400000), 7);
});
