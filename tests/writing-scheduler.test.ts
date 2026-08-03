import assert from "node:assert/strict";
import test from "node:test";
import { decideWritingReview, WRITING_REVIEW_INTERVALS } from "../lib/writing-scheduler";

const now = new Date("2026-08-02T00:00:00.000Z");

test("writing review advances through 1, 3, 7, 14 and 30 day stages", () => {
  assert.deepEqual(WRITING_REVIEW_INTERVALS, [1, 3, 7, 14, 30]);
  let current = { stage: 0, reps: 0, lapses: 0 };
  for (let index = 0; index < WRITING_REVIEW_INTERVALS.length; index++) {
    const result = decideWritingReview(current, true, true, now);
    assert.equal(result.stage, index + 1);
    const expectedDays = index === WRITING_REVIEW_INTERVALS.length - 1 ? 30 : WRITING_REVIEW_INTERVALS[index + 1];
    assert.equal((+result.nextReviewAt - +now) / 86_400_000, expectedDays);
    current = result;
  }
  assert.equal(current.stage, 5);
  assert.equal((current as { status?: string }).status, "mastered");
});

test("a hinted pass stays at stage zero and returns tomorrow", () => {
  const result = decideWritingReview({ stage: 3, reps: 4, lapses: 1 }, true, false, now);
  assert.equal(result.stage, 0);
  assert.equal(result.reps, 4);
  assert.equal((+result.nextReviewAt - +now) / 86_400_000, 1);
});

test("a failed review resets and records a lapse", () => {
  const result = decideWritingReview({ stage: 4, reps: 8, lapses: 2 }, false, false, now);
  assert.equal(result.stage, 0);
  assert.equal(result.lapses, 3);
  assert.equal(result.status, "active");
});
