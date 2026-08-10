// 词级 diff：比对默写文本与原句，区分拼写错误和用词差异。
// 纯函数，供写作工坊"对照"步骤高亮与点评使用。

export type DiffSegment =
  | { kind: "match"; text: string }
  | { kind: "spelling"; text: string; expected: string }
  | { kind: "wording"; text: string; expected: string }
  | { kind: "extra"; text: string }
  | { kind: "missing"; text: string };

export interface WordDiffResult {
  segments: DiffSegment[];
  spelling: { wrote: string; expected: string }[];
  wording: { wrote: string; expected: string }[];
  missing: string[];
  extra: string[];
  identical: boolean;
}

export function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[b.length];
}

function looksLikeSpelling(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (Math.min(a.length, b.length) < 3) return false;
  const distance = levenshtein(a, b);
  return distance > 0 && distance <= 2;
}

export function diffWords(recall: string, original: string): WordDiffResult {
  const userTokens = recall.trim().split(/\s+/).filter(Boolean);
  const origTokens = original.trim().split(/\s+/).filter(Boolean);
  const u = userTokens.map(normalizeToken);
  const o = origTokens.map(normalizeToken);
  const m = u.length;
  const n = o.length;

  // LCS 动态规划（按规范化形式比对）
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = u[i] === o[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  let bufU: string[] = [];
  let bufO: string[] = [];

  function flush() {
    const k = Math.max(bufU.length, bufO.length);
    for (let t = 0; t < k; t++) {
      const ut = bufU[t];
      const ot = bufO[t];
      if (ut !== undefined && ot !== undefined) {
        if (looksLikeSpelling(normalizeToken(ut), normalizeToken(ot))) {
          segments.push({ kind: "spelling", text: ut, expected: ot });
        } else {
          segments.push({ kind: "wording", text: ut, expected: ot });
        }
      } else if (ut !== undefined) {
        segments.push({ kind: "extra", text: ut });
      } else {
        segments.push({ kind: "missing", text: ot! });
      }
    }
    bufU = [];
    bufO = [];
  }

  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && u[i] === o[j]) {
      flush();
      segments.push({ kind: "match", text: userTokens[i] });
      i++;
      j++;
    } else if (j < n && (i === m || dp[i][j + 1] >= dp[i + 1][j])) {
      bufO.push(origTokens[j]);
      j++;
    } else {
      bufU.push(userTokens[i]);
      i++;
    }
  }
  flush();

  const result: WordDiffResult = {
    segments,
    spelling: [],
    wording: [],
    missing: [],
    extra: [],
    identical: true,
  };
  for (const seg of segments) {
    if (seg.kind === "spelling") result.spelling.push({ wrote: seg.text, expected: seg.expected });
    else if (seg.kind === "wording") result.wording.push({ wrote: seg.text, expected: seg.expected });
    else if (seg.kind === "missing") result.missing.push(seg.text);
    else if (seg.kind === "extra") result.extra.push(seg.text);
    if (seg.kind !== "match") result.identical = false;
  }
  return result;
}
