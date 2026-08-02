import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewTasks } from "../lib/review-tasks";

const words = [
  { id: "alpha" },
  { id: "bravo" },
  { id: "charlie" },
  { id: "delta" },
];

test("strict review interleaves both task types without adjacent duplicate words", () => {
  const randomValues = [0.81, 0.14, 0.65, 0.32, 0.93, 0.47, 0.06];
  let index = 0;
  const tasks = buildReviewTasks(words, true, "spell", () => randomValues[index++ % randomValues.length]);

  assert.equal(tasks.length, words.length * 2);
  for (const word of words) {
    assert.deepEqual(
      tasks.filter((task) => task.word.id === word.id).map((task) => task.mode).sort(),
      ["choice", "spell"],
    );
  }
  assert.equal(
    tasks.some((task, taskIndex) => taskIndex > 0 && tasks[taskIndex - 1].word.id === task.word.id),
    false,
  );
  assert.equal(tasks.every((task, taskIndex) => taskIndex === 0 || tasks[taskIndex - 1].mode === task.mode), false);
});

test("strict review fallback remains separated with a pathological random generator", () => {
  const tasks = buildReviewTasks(words.slice(0, 2), true, "spell", () => 0);
  assert.equal(tasks.length, 4);
  assert.equal(
    tasks.some((task, taskIndex) => taskIndex > 0 && tasks[taskIndex - 1].word.id === task.word.id),
    false,
  );
});

test("non-strict review keeps one requested mode per word", () => {
  const tasks = buildReviewTasks(words, false, "choice", () => 0.5);
  assert.equal(tasks.length, words.length);
  assert.equal(tasks.every((task) => task.mode === "choice"), true);
});
