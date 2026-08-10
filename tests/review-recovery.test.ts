import assert from "node:assert/strict";
import test from "node:test";
import { initialRecovery, isCleared, onCorrect, onWrong, type WordRecovery } from "../lib/review-recovery";

function answerCorrect(state: WordRecovery, mode: "spell" | "choice") {
  return onCorrect(state, mode);
}

test("非强检查：一次答对即完成，上报 normal", () => {
  const state = initialRecovery(false, "spell");
  const { next, report } = onCorrect(state, "spell");
  assert.equal(report, "normal");
  assert.equal(isCleared(next), true);
});

test("答错后需连对 3 次：前两次报 recoveryPass，第三次报 complete", () => {
  let state = initialRecovery(false, "spell");
  const wrong = onWrong(state, "spell", false);
  state = wrong.next;
  assert.deepEqual(wrong.requeue, ["spell"]);
  assert.equal(state.spell.required, 3);
  assert.equal(state.spell.streak, 0);
  assert.equal(state.spell.done, false);

  const first = answerCorrect(state, "spell");
  assert.equal(first.report, "recoveryPass");
  assert.equal(first.next.spell.streak, 1);
  assert.equal(isCleared(first.next), false);

  const second = answerCorrect(first.next, "spell");
  assert.equal(second.report, "recoveryPass");
  assert.equal(second.next.spell.streak, 2);

  const third = answerCorrect(second.next, "spell");
  assert.equal(third.report, "complete");
  assert.equal(third.next.spell.done, true);
  assert.equal(isCleared(third.next), true);
});

test("补考中途再答错：连对数清零，重新要求 3 次", () => {
  let state = initialRecovery(false, "spell");
  state = onWrong(state, "spell", false).next;
  state = answerCorrect(state, "spell").next; // streak 1
  state = answerCorrect(state, "spell").next; // streak 2

  const again = onWrong(state, "spell", false);
  assert.equal(again.next.spell.streak, 0);
  assert.equal(again.next.spell.required, 3);
  assert.deepEqual(again.requeue, ["spell"]);

  // 重新连对 3 次才完成
  state = again.next;
  assert.equal(answerCorrect(state, "spell").report, "recoveryPass");
  state = answerCorrect(state, "spell").next;
  state = answerCorrect(state, "spell").next;
  assert.equal(answerCorrect(state, "spell").report, "complete");
});

test("强检查：答错一个题型，已通过的另一题型被重置并要求补回来", () => {
  let state = initialRecovery(true, "spell");
  // choice 先通过
  state = answerCorrect(state, "choice").next;
  assert.equal(state.choice.done, true);

  // spell 答错：服务端会清空两个 passed 标志，choice 需重考 1 次
  const wrong = onWrong(state, "spell", true);
  assert.deepEqual([...wrong.requeue].sort(), ["choice", "spell"]);
  assert.equal(wrong.next.spell.required, 3);
  assert.equal(wrong.next.choice.done, false);
  assert.equal(wrong.next.choice.required, 1);

  // spell 连对 3 次 + choice 过 1 次后才全部完成
  state = wrong.next;
  state = answerCorrect(state, "spell").next;
  state = answerCorrect(state, "spell").next;
  const spellDone = answerCorrect(state, "spell");
  assert.equal(spellDone.report, "complete");
  assert.equal(isCleared(spellDone.next), false); // choice 还没补回来
  const choiceDone = answerCorrect(spellDone.next, "choice");
  assert.equal(choiceDone.report, "normal");
  assert.equal(isCleared(choiceDone.next), true);
});

test("强检查：另一题型尚未通过时，答错只重插答错的题型", () => {
  const state = initialRecovery(true, "spell");
  const wrong = onWrong(state, "spell", true);
  assert.deepEqual(wrong.requeue, ["spell"]);
  assert.equal(wrong.next.choice.done, false);
});
