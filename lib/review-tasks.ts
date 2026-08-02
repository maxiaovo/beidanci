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
 * Builds the whole review queue before the session begins.
 * Strict review includes both task types, globally interleaves them, and keeps
 * the same word apart whenever the queue contains at least two words.
 */
export function buildReviewTasks<T extends { id: string }>(
  words: T[],
  strict: boolean,
  mode: ReviewTaskMode,
  random: () => number = Math.random,
): ReviewTask<T>[] {
  if (!strict) return shuffle(words, random).map((word) => ({ word, mode }));

  const allTasks = words.flatMap((word) => [
    { word, mode: "spell" as const },
    { word, mode: "choice" as const },
  ]);
  if (words.length < 2) return allTasks;

  // Prefer a fully random queue, retrying a few times to avoid sibling adjacency.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = shuffle(allTasks, random);
    if (!hasAdjacentDuplicate(candidate)) return candidate;
  }

  // Deterministic fallback for pathological/injected random generators.
  const order = shuffle(words, random);
  const first = order.map((word, index) => ({
    word,
    mode: (index % 2 === 0 ? "spell" : "choice") as ReviewTaskMode,
  }));
  const secondOrder = order;
  const second = secondOrder.map((word) => {
    const firstTask = first.find((task) => task.word.id === word.id)!;
    return { word, mode: firstTask.mode === "spell" ? ("choice" as const) : ("spell" as const) };
  });
  return [...first, ...second];
}
