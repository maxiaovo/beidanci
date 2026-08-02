import assert from "node:assert/strict";
import test from "node:test";
import { decideProgress } from "../lib/progress-decision";

const now = new Date("2026-08-02T00:00:00.000Z");
const existing = {
  stage: 3,
  nextReviewAt: new Date("2026-08-01T00:00:00.000Z"),
  spellPassed: false,
  choicePassed: false,
};

test("a clean review answer advances the memory stage", () => {
  const decision = decideProgress({
    existing,
    mode: "check-spell",
    result: "correct",
    strict: false,
    hadFailure: false,
    now,
  });
  assert.equal(decision.stage, 4);
});

test("a corrected review stays at stage zero after failing earlier in the session", () => {
  const decision = decideProgress({
    existing: { ...existing, stage: 0 },
    mode: "check-spell",
    result: "correct",
    strict: false,
    hadFailure: true,
    now,
  });
  assert.equal(decision.stage, 0);
});

test("strict review advances only after both clean task types pass", () => {
  const first = decideProgress({
    existing,
    mode: "check-spell",
    result: "correct",
    strict: true,
    hadFailure: false,
    now,
  });
  assert.equal(first.stage, 3);
  assert.equal(first.spellPassed, true);

  const second = decideProgress({
    existing: { ...first },
    mode: "check-choice",
    result: "correct",
    strict: true,
    hadFailure: false,
    now,
  });
  assert.equal(second.stage, 4);
  assert.equal(second.spellPassed, false);
  assert.equal(second.choicePassed, false);
});

test("strict review does not upgrade a word that failed earlier in the session", () => {
  const decision = decideProgress({
    existing: { ...existing, stage: 0, spellPassed: true },
    mode: "check-choice",
    result: "correct",
    strict: true,
    hadFailure: true,
    now,
  });
  assert.equal(decision.stage, 0);
  assert.equal(decision.spellPassed, false);
  assert.equal(decision.choicePassed, false);
});

test("learn mode still advances normally", () => {
  const decision = decideProgress({
    existing,
    mode: "learn",
    result: "correct",
    strict: false,
    hadFailure: true,
    now,
  });
  assert.equal(decision.stage, 4);
});
