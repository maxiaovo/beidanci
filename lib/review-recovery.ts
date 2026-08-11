// 复习补考状态机（纯函数，便于单测）：
// 答错/放弃的题型在本轮后面补考，累计答对 target 次才算过（target 由家长设置，默认 1）。
// 循环补考开启时：补考过程中再答错，已累计次数清零重计；关闭时累计次数保留。
// 强检查模式下答错会在服务端清空两个题型的 passed 标志，
// 因此另一题型若已通过，需重置并补考 1 次补回来。
// 熔断：同一词本场连续失败达到 RECOVERY_FUSE_LIMIT 次后移出本场队列（视为已通过），
// 调用方上报 result="defer"（服务端把该词推到明日再复习），避免循环补考永远无法结束。

export type TaskMode = "spell" | "choice";

export interface ModeRecovery {
  required: number; // 需答对次数（首次通过为 1，补考为家长设定的 target）
  passed: number; // 已累计答对次数
  done: boolean; // 该题型已通过（首次通过或补考通过）
}

export interface WordRecovery {
  spell: ModeRecovery;
  choice: ModeRecovery;
  failStreak: number; // 本场连续失败次数（任意答对清零），达到上限触发熔断
}

// 同一词本场连续失败达到该次数即熔断（移出本场，明日再复习）
export const RECOVERY_FUSE_LIMIT = 5;

const otherMode = (mode: TaskMode): TaskMode => (mode === "spell" ? "choice" : "spell");

function clone(state: WordRecovery): WordRecovery {
  return {
    spell: { ...state.spell },
    choice: { ...state.choice },
    failStreak: state.failStreak,
  };
}

// 非强检查时本场只有 sessionMode 一种题型，另一题型视为已完成。
// strict 模式下服务端会下发各题型已 pass 的标志（spellPassed/choicePassed），
// 已通过的题型初始即视为 done（答错后服务端清空标志时再按强检查规则补回来）。
export function initialRecovery(
  strict: boolean,
  sessionMode: TaskMode,
  passed?: { spell?: boolean; choice?: boolean },
): WordRecovery {
  const fresh = (): ModeRecovery => ({ required: 1, passed: 0, done: false });
  const state: WordRecovery = { spell: fresh(), choice: fresh(), failStreak: 0 };
  if (!strict) state[otherMode(sessionMode)].done = true;
  if (strict) {
    if (passed?.spell) state.spell.done = true;
    if (passed?.choice) state.choice.done = true;
  }
  return state;
}

export function isCleared(state: WordRecovery): boolean {
  return state.spell.done && state.choice.done;
}

// 答错/放弃：该题型需补考 target 次（循环补考下已累计次数清零），重插入队；
// 返回需要重插入队的题型。
// tripped=true 表示熔断：该词移出本场队列（requeue 为空、isCleared 为 true），
// 调用方应上报 result="defer" 并提示用户明日再练。
export function onWrong(
  state: WordRecovery,
  failedMode: TaskMode,
  strict: boolean,
  target = 1,
  cyclic = false,
): { next: WordRecovery; requeue: TaskMode[]; tripped: boolean } {
  const failStreak = state.failStreak + 1;
  if (failStreak >= RECOVERY_FUSE_LIMIT) {
    // 熔断：不再重插，该词两题型均视为通过（本场不再出现）
    const next = clone(state);
    next.spell = { ...next.spell, done: true };
    next.choice = { ...next.choice, done: true };
    next.failStreak = failStreak;
    return { next, requeue: [], tripped: true };
  }

  const next = clone(state);
  next.failStreak = failStreak;
  next[failedMode] = {
    required: Math.max(1, target),
    passed: cyclic ? 0 : state[failedMode].passed,
    done: false,
  };
  const requeue: TaskMode[] = [failedMode];

  if (strict) {
    const other = otherMode(failedMode);
    // 服务端已清空两个 passed 标志：另一题型若此前已通过，重置并补考 1 次
    if (next[other].done) {
      next[other] = { required: 1, passed: 0, done: false };
      requeue.push(other);
    }
  }
  return { next, requeue, tripped: false };
}

export type CorrectReport = "normal" | "recoveryPass" | "complete";

// 答对：累计补考答对次数；达到要求次数后该题型完成。任意答对清零连续失败计数。
// normal = 一次过；recoveryPass = 补考中间次（不上报晋级，仍需再补）；
// complete = 补考最后一次答对（按普通 correct 上报晋级）
export function onCorrect(state: WordRecovery, mode: TaskMode): { next: WordRecovery; report: CorrectReport } {
  const next = clone(state);
  next.failStreak = 0;
  const entry = next[mode];
  if (entry.done) return { next, report: "normal" };

  const passed = entry.passed + 1;
  if (passed >= entry.required) {
    next[mode] = { ...entry, passed, done: true };
    return { next, report: entry.required > 1 ? "complete" : "normal" };
  }
  next[mode] = { ...entry, passed };
  return { next, report: "recoveryPass" };
}
