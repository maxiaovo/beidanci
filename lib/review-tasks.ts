export type ReviewTaskMode = "spell" | "choice";

export interface ReviewTask<T> {
  word: T;
  mode: ReviewTaskMode;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hasAdjacentDuplicate<T extends { id: string }>(tasks: ReviewTask<T>[]) {
  return tasks.some((task, index) => index > 0 && tasks[index - 1].word.id === task.word.id);
}

/**
 * 把补考题随机插入 fromIdx 之后的剩余队列，至少隔 1 题再出现
 * （避免刚作答完立刻重考同一个词）；剩余不足时追加到末尾。
 */
export function insertAtRandomSpot<T>(tasks: T[], task: T, fromIdx: number, random: () => number = Math.random): T[] {
  const result = [...tasks];
  const min = Math.min(fromIdx + 2, result.length);
  const pos = min + Math.floor(random() * (result.length - min + 1));
  result.splice(pos, 0, task);
  return result;
}

/**
 * Builds the whole review queue before the session begins.
 * Strict review includes both task types, globally interleaves them, and keeps
 * the same word apart whenever the queue contains at least two words.
 * strict 模式下词可能带有服务端下发的 spellPassed/choicePassed 标志，
 * 已通过的题型不再出题（只补未过的题型）。
 */
export function buildReviewTasks<T extends { id: string; spellPassed?: boolean; choicePassed?: boolean }>(
  words: T[],
  strict: boolean,
  mode: ReviewTaskMode,
  random: () => number = Math.random,
): ReviewTask<T>[] {
  if (!strict) return shuffle(words, random).map((word) => ({ word, mode }));

  const allTasks = words.flatMap((word) => [
    ...(word.spellPassed ? [] : [{ word, mode: "spell" as const }]),
    ...(word.choicePassed ? [] : [{ word, mode: "choice" as const }]),
  ]);
  if (words.length < 2) return allTasks;

  // Prefer a fully random queue, retrying a few times to avoid sibling adjacency.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = shuffle(allTasks, random);
    if (!hasAdjacentDuplicate(candidate)) return candidate;
  }

  // Deterministic fallback for pathological/injected random generators.
  // 每种题型只出一次；只缺一种题型的词不出第二题。
  const order = shuffle(words, random);
  const first: ReviewTask<T>[] = [];
  const second: ReviewTask<T>[] = [];
  order.forEach((word, index) => {
    const modes: ReviewTaskMode[] = [
      ...(word.spellPassed ? [] : (["spell"] as const)),
      ...(word.choicePassed ? [] : (["choice"] as const)),
    ];
    if (modes.length === 2) {
      // 交替分配首个题型，第二个题型放到后半场，保证同词不相邻
      const [a, b] = index % 2 === 0 ? modes : [modes[1], modes[0]];
      first.push({ word, mode: a });
      second.push({ word, mode: b });
    } else if (modes.length === 1) {
      first.push({ word, mode: modes[0] });
    }
  });
  return [...first, ...second];
}
