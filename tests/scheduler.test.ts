import assert from "node:assert/strict";
import test from "node:test";
import { MAX_STAGE, advanceStage, nextReviewDate } from "../lib/scheduler";

const from = new Date("2026-08-02T12:00:00.000Z");
const DAY = 24 * 3600 * 1000;

test("nextReviewDate follows the interval ladder per stage", () => {
  const expected = [
    10 * 60 * 1000, // stage 0 -> 10 分钟
    1 * DAY,
    2 * DAY,
    4 * DAY,
    7 * DAY,
    15 * DAY,
    30 * DAY,
    60 * DAY,
  ];
  expected.forEach((interval, stage) => {
    assert.equal(nextReviewDate(stage, from).getTime() - from.getTime(), interval, `stage ${stage}`);
  });
});

test("nextReviewDate clamps negative stages to stage 0", () => {
  assert.equal(nextReviewDate(-1, from).getTime(), nextReviewDate(0, from).getTime());
  assert.equal(nextReviewDate(-100, from).getTime(), nextReviewDate(0, from).getTime());
});

test("nextReviewDate caps stages beyond the ladder at the top interval", () => {
  assert.equal(nextReviewDate(MAX_STAGE, from).getTime() - from.getTime(), 60 * DAY);
  assert.equal(nextReviewDate(MAX_STAGE + 5, from).getTime(), nextReviewDate(MAX_STAGE, from).getTime());
});

test("advanceStage increments on correct and caps at MAX_STAGE", () => {
  assert.equal(advanceStage(0, true), 1);
  assert.equal(advanceStage(MAX_STAGE - 1, true), MAX_STAGE);
  assert.equal(advanceStage(MAX_STAGE, true), MAX_STAGE);
});

test("advanceStage drops to zero on failure", () => {
  assert.equal(advanceStage(0, false), 0);
  assert.equal(advanceStage(5, false), 0);
  assert.equal(advanceStage(MAX_STAGE, false), 0);
});
