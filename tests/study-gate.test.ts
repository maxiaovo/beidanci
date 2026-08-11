import assert from "node:assert/strict";
import test from "node:test";
import { isReviewGateOpen } from "../lib/study-gate";

test("gate opens when the due queue is empty", () => {
  assert.equal(isReviewGateOpen(0, 0, 20), true);
});

test("gate stays closed while due reviews remain and quota is unmet", () => {
  assert.equal(isReviewGateOpen(5, 0, 20), false);
  assert.equal(isReviewGateOpen(5, 19, 20), false);
});

test("gate opens once today's review quota is met, even with backlog", () => {
  assert.equal(isReviewGateOpen(100, 20, 20), true);
  assert.equal(isReviewGateOpen(100, 25, 20), true);
});
