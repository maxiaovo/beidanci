// 复习补考状态机（纯函数，便于单测）：
// 答错/放弃的题型要求在本轮内连续答对 3 次才晋级（中途再错连对数清零重数）。
// 强检查模式下答错会在服务端清空两个题型的 passed 标志，
// 因此另一题型若已通过，需要重置并重插 1 次补回来。

export type TaskMode = "spell" | "choice";

export interface ModeRecovery {
  required: 1 | 3; // 需要连续通过的次数
  streak: number; // 当前连对数
  done: boolean; // 该题型要求已满足
}

export type WordRecovery = Record<TaskMode, ModeRecovery>;

const otherMode = (mode: TaskMode): TaskMode => (mode === "spell" ? "choice" : "spell");

function clone(state: WordRecovery): WordRecovery {
  return {
    spell: { ...state.spell },
    choice: { ...state.choice },
  };
}

// 非强检查时本场只有 sessionMode 一种题型，另一题型视为已完成
export function initialRecovery(strict: boolean, sessionMode: TaskMode): WordRecovery {
  const fresh = (): ModeRecovery => ({ required: 1, streak: 0, done: false });
  const state: WordRecovery = { spell: fresh(), choice: fresh() };
  if (!strict) state[otherMode(sessionMode)].done = true;
  return state;
}

export function isCleared(state: WordRecovery): boolean {
  return state.spell.done && state.choice.done;
}

// 答错/放弃：该题型改为需连对 3 次，连对数清零；返回需要重插入队的题型
export function onWrong(
  state: WordRecovery,
  failedMode: TaskMode,
  strict: boolean,
): { next: WordRecovery; requeue: TaskMode[] } {
  const next = clone(state);
  next[failedMode] = { required: 3, streak: 0, done: false };
  const requeue: TaskMode[] = [failedMode];

  if (strict) {
    const other = otherMode(failedMode);
    // 服务端已清空两个 passed 标志：另一题型若此前已通过，重置为需再过 1 次
    if (next[other].done) {
      next[other] = { required: 1, streak: 0, done: false };
      requeue.push(other);
    }
  }
  return { next, requeue };
}

export type CorrectReport = "normal" | "recoveryPass" | "complete";

// 答对：累计连对数；达到要求次数后该题型完成。
// normal = 一次过；recoveryPass = 补考中间次（不上报晋级）；complete = 补考第 3 次连对（按普通 correct 上报晋级）
export function onCorrect(state: WordRecovery, mode: TaskMode): { next: WordRecovery; report: CorrectReport } {
  const next = clone(state);
  const entry = next[mode];
  if (entry.done) return { next, report: "normal" };

  const streak = entry.streak + 1;
  if (streak >= entry.required) {
    next[mode] = { ...entry, streak, done: true };
    return { next, report: entry.required === 3 ? "complete" : "normal" };
  }
  next[mode] = { ...entry, streak };
  return { next, report: "recoveryPass" };
}
