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

test("默认补考 1 次：答错后补考一次，答对即过", () => {
  const wrong = onWrong(initialRecovery(false, "spell"), "spell", false);
  assert.deepEqual(wrong.requeue, ["spell"]);
  assert.equal(wrong.next.spell.required, 1);
  assert.equal(wrong.next.spell.done, false);

  const passed = onCorrect(wrong.next, "spell");
  assert.equal(passed.report, "normal"); // required=1 时补考通过按普通 correct 上报
  assert.equal(isCleared(passed.next), true);
});

test("补考 3 次（非循环）：中间次报 recoveryPass，第 3 次报 complete；中途答错不清零", () => {
  let state = onWrong(initialRecovery(false, "spell"), "spell", false, 3, false).next;
  assert.equal(state.spell.required, 3);

  const first = answerCorrect(state, "spell");
  assert.equal(first.report, "recoveryPass");
  assert.equal(first.next.spell.passed, 1);

  // 非循环：补考中途答错，已累计次数保留
  const again = onWrong(first.next, "spell", false, 3, false);
  assert.equal(again.next.spell.passed, 1);
  assert.equal(again.next.spell.required, 3);
  assert.deepEqual(again.requeue, ["spell"]);

  state = again.next;
  assert.equal(answerCorrect(state, "spell").report, "recoveryPass"); // passed 2
  state = answerCorrect(state, "spell").next;
  const done = answerCorrect(state, "spell"); // passed 3
  assert.equal(done.report, "complete");
  assert.equal(isCleared(done.next), true);
});

test("补考 3 次（循环）：补考中途答错，已累计次数清零重计", () => {
  let state = onWrong(initialRecovery(false, "spell"), "spell", false, 3, true).next;
  state = answerCorrect(state, "spell").next; // passed 1
  state = answerCorrect(state, "spell").next; // passed 2

  const again = onWrong(state, "spell", false, 3, true);
  assert.equal(again.next.spell.passed, 0);
  assert.equal(again.next.spell.required, 3);
  assert.deepEqual(again.requeue, ["spell"]);

  // 重新累计 3 次才完成
  state = again.next;
  assert.equal(answerCorrect(state, "spell").report, "recoveryPass");
  state = answerCorrect(state, "spell").next;
  state = answerCorrect(state, "spell").next;
  assert.equal(answerCorrect(state, "spell").report, "complete");
});

test("强检查：答错一个题型，已通过的另一题型被重置并补考 1 次（两题合算一次补考）", () => {
  let state = initialRecovery(true, "spell");
  // choice 先通过
  state = answerCorrect(state, "choice").next;
  assert.equal(state.choice.done, true);

  // spell 答错：服务端会清空两个 passed 标志，choice 需补考 1 次补回来
  const wrong = onWrong(state, "spell", true, 3, false);
  assert.deepEqual([...wrong.requeue].sort(), ["choice", "spell"]);
  assert.equal(wrong.next.spell.required, 3); // 答错题型按补考次数设置
  assert.equal(wrong.next.choice.done, false);
  assert.equal(wrong.next.choice.required, 1); // 被牵连的题型只补 1 次

  // spell 补满 3 次 + choice 补 1 次后才全部完成
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
  const wrong = onWrong(state, "spell", true, 3, false);
  assert.deepEqual(wrong.requeue, ["spell"]);
  assert.equal(wrong.next.choice.done, false);
});

test("熔断：同一词连续失败 5 次后移出本场（不再重插、视为已通过）", () => {
  let state = initialRecovery(false, "spell");
  for (let i = 0; i < 4; i++) {
    const r = onWrong(state, "spell", false, 3, true);
    assert.equal(r.tripped, false);
    assert.deepEqual(r.requeue, ["spell"]);
    assert.equal(r.next.failStreak, i + 1);
    state = r.next;
  }
  const fifth = onWrong(state, "spell", false, 3, true);
  assert.equal(fifth.tripped, true);
  assert.deepEqual(fifth.requeue, []); // 熔断后不再重插，本场可以结束
  assert.equal(isCleared(fifth.next), true); // 视为已通过（调用方上报 defer 推到明日）
});

test("熔断：中途任意答对清零连续失败计数", () => {
  let state = initialRecovery(false, "spell");
  for (let i = 0; i < 4; i++) state = onWrong(state, "spell", false, 3, false).next; // 连续失败 4 次

  state = onCorrect(state, "spell").next; // 补考中间次答对，计数清零
  assert.equal(state.failStreak, 0);

  // 再连续失败 4 次仍未熔断，第 5 次熔断
  for (let i = 0; i < 4; i++) {
    const r = onWrong(state, "spell", false, 3, false);
    assert.equal(r.tripped, false);
    state = r.next;
  }
  const fifth = onWrong(state, "spell", false, 3, false);
  assert.equal(fifth.tripped, true);
  assert.equal(isCleared(fifth.next), true);
});

test("强检查：初始带入服务端已通过题型标志，答错时已通过题型按规则补回 1 次", () => {
  const state = initialRecovery(true, "spell", { spell: true });
  assert.equal(state.spell.done, true);
  assert.equal(state.choice.done, false);

  // choice 答错：服务端清空两个 passed 标志，spell 此前已通过需补考 1 次补回来
  const wrong = onWrong(state, "choice", true, 1, false);
  assert.deepEqual([...wrong.requeue].sort(), ["choice", "spell"]);
  assert.equal(wrong.next.spell.required, 1);
});
