import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewTasks, insertAtRandomSpot } from "../lib/review-tasks";

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

test("insertAtRandomSpot keeps at least one task between current index and the requeued task", () => {
  const queue = ["a", "b", "c", "d", "e"];
  // random() = 0 → 插到最早允许的位置（fromIdx + 2）
  assert.deepEqual(insertAtRandomSpot(queue, "x", 0, () => 0), ["a", "b", "x", "c", "d", "e"]);
  // random() ≈ 1 → 插到队列末尾
  assert.deepEqual(insertAtRandomSpot(queue, "x", 0, () => 0.999), ["a", "b", "c", "d", "e", "x"]);
  // 剩余不足一题时直接追加到末尾
  assert.deepEqual(insertAtRandomSpot(["a"], "x", 0, () => 0), ["a", "x"]);
  // 不改动原数组
  const original = ["a", "b", "c"];
  insertAtRandomSpot(original, "x", 0, () => 0.5);
  assert.deepEqual(original, ["a", "b", "c"]);
});
