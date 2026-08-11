"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { playDing, playGua } from "@/lib/client";
import { clampPx } from "@/lib/appearance";

// 容易输入的 ASCII 标点/空格；字母、数字以及这些之外的字符视为"难打符号"
const EASY_CHARS = new Set(" .,;:'\"?!()-/&@#%$*+=<>[]{}\\|_^".split(""));
function isHardChar(c: string) {
  if (/\p{L}/u.test(c) || /\d/.test(c)) return false;
  return !EASY_CHARS.has(c);
}

// 临摹输入：目标文本浅灰显示，逐字符键入；正确黑、错误红+抖动
// 全部正确后按回车（或点"下一步"按钮）触发 onComplete
// 移动端：内置一个 visually-hidden 的 <input> 唤起虚拟键盘（不能用 display:none，否则无法 focus）。
// 物理键盘仍走 window.keydown；事件来自该 input 时跳过，避免与 input 自身 handler 双重触发。
export default function TypingTrainer({
  target,
  onComplete,
  fontSizePx = 72,
  placeholder = "开始输入…",
}: {
  target: string;
  onComplete: () => void;
  fontSizePx?: number;
  placeholder?: string;
}) {
  const [typed, setTyped] = useState<string>("");
  const [shake, setShake] = useState(0);
  // 空格位置输错的下标集合：这些位置渲染 💩
  const [wrongSpaces, setWrongSpaces] = useState<Set<number>>(new Set());
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMatch = useCallback(
    (a: string, b: string) => {
      // 字母不区分大小写，其余字符精确匹配
      if (/[a-zA-Z]/.test(a) && /[a-zA-Z]/.test(b)) return a.toLowerCase() === b.toLowerCase();
      return a === b;
    },
    []
  );

  const allCorrect = typed.length === target.length && typed.split("").every((c, i) => isMatch(c, target[i]));

  // 目标文本中出现的难打符号（去重），用于底部提示
  const hardChars = [...new Set(target.split("").filter(isHardChar))];

  // mount 后自动聚焦隐藏输入框，唤起移动端虚拟键盘
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const backspace = useCallback(() => {
    setTyped((t) => t.slice(0, -1));
    setWrongSpaces((s) => {
      if (!s.has(typed.length - 1)) return s;
      const next = new Set(s);
      next.delete(typed.length - 1);
      return next;
    });
  }, [typed.length]);

  const complete = useCallback(() => {
    if (allCorrect && !doneRef.current) {
      doneRef.current = true;
      playDing();
      onComplete();
    }
  }, [allCorrect, onComplete]);

  const typeChar = useCallback(
    (key: string) => {
      if (typed.length >= target.length) return;
      const expected = target[typed.length];
      // 难打符号：按 ` 或 ~ 直接填入正确字符（算对）
      if ((key === "`" || key === "~") && isHardChar(expected)) {
        setTyped((t) => t + expected);
        return;
      }
      if (!isMatch(key, expected)) {
        if (expected === " ") {
          // 空格位置输错：渲染 💩 + 呱
          const idx = typed.length;
          setWrongSpaces((s) => new Set(s).add(idx));
          playGua();
        } else {
          setShake((s) => s + 1);
        }
      }
      setTyped((t) => t + key);
    },
    [typed, target, isMatch]
  );

  // 物理键盘（含桌面浏览器）：input 未聚焦时全靠这里
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // 来自隐藏 input 的事件由 input 的 onChange/onKeyDown 处理，这里跳过防双重触发
      if (e.target === inputRef.current) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace") {
        backspace();
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        complete();
        e.preventDefault();
        return;
      }
      if (e.key.length !== 1) return;
      typeChar(e.key);
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backspace, complete, typeChar]);

  // 移动端虚拟键盘：很多键盘不发标准 keydown（key 为 "Unidentified"），统一走 onChange 做 diff
  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v.length <= typed.length || !v.startsWith(typed)) {
      // 删除或被输入法整体改写：以新值为准，清理越界的 💩 标记
      setTyped(v);
      setWrongSpaces((s) => new Set([...s].filter((i) => i < v.length)));
      return;
    }
    // 新增字符逐个走与物理键盘相同的校验逻辑（闭包内 typed 不变，用 cur 顺序推进）
    let cur = typed;
    let shakes = 0;
    let gua = false;
    const wrong = new Set(wrongSpaces);
    for (const ch of v.slice(typed.length)) {
      if (cur.length >= target.length) break;
      const expected = target[cur.length];
      let out = ch;
      if ((ch === "`" || ch === "~") && isHardChar(expected)) {
        out = expected;
      } else if (!isMatch(ch, expected)) {
        if (expected === " ") {
          wrong.add(cur.length);
          gua = true;
        } else {
          shakes++;
        }
      }
      cur += out;
    }
    setTyped(cur);
    setWrongSpaces(wrong);
    if (shakes > 0) setShake((s) => s + shakes);
    if (gua) playGua();
  }

  // 回车在 keydown 处理（onChange 不会因回车触发）
  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      complete();
    }
  }

  // 按空格把目标文本分词：换行只发生在词与词之间，绝不从单词中间断开
  const tokens: { word: boolean; indices: number[] }[] = [];
  target.split("").forEach((c, i) => {
    const isWord = c !== " ";
    const last = tokens[tokens.length - 1];
    if (last && last.word === isWord) last.indices.push(i);
    else tokens.push({ word: isWord, indices: [i] });
  });

  const renderChar = (c: string, i: number) => {
    let cls = "text-black/15"; // 未输入：浅灰
    const isWrongSpace = wrongSpaces.has(i);
    if (i < typed.length) {
      cls = isMatch(typed[i], c) ? "text-black" : "text-red-500";
    }
    const isCursor = i === typed.length;
    return (
      <span key={i} className="relative">
        <span className={isWrongSpace ? "" : cls}>{isWrongSpace ? "💩" : c === " " ? " " : c}</span>
        {isCursor && (
          <span className="cursor-blink absolute -bottom-1 left-0 right-0 h-1 bg-blue-400 rounded" />
        )}
      </span>
    );
  };

  return (
    <div
      className="relative flex flex-col items-center gap-4 w-full"
      onClick={(e) => {
        // 点按 trainer 区域：重新聚焦隐藏输入框唤起键盘；并阻止冒泡触发外层点按翻页
        e.stopPropagation();
        inputRef.current?.focus();
      }}
    >
      {/* visually-hidden 输入框：仅用于唤起移动端虚拟键盘（不能 display:none，否则无法 focus）。
          data-typing-trainer 供 learn 页全局键盘导航豁免（Shift+方向键需要冒泡到 window） */}
      <input
        ref={inputRef}
        value={typed}
        onChange={onInputChange}
        onKeyDown={onInputKeyDown}
        data-typing-trainer=""
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="拼写输入"
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      />
      <div
        key={shake}
        className={`${shake > 0 ? "animate-shake" : ""} font-mono font-bold leading-relaxed tracking-wider text-center w-full flex flex-wrap justify-center`}
        style={{ fontSize: clampPx(fontSizePx) }}
      >
        {tokens.map((t, ti) =>
          t.word ? (
            // 一个单词整体作为不可断行单元
            <span key={ti} className="inline-flex whitespace-nowrap">
              {t.indices.map((i) => renderChar(target[i], i))}
            </span>
          ) : (
            t.indices.map((i) => renderChar(target[i], i))
          ),
        )}
        {typed.length === 0 && target.length === 0 && (
          <span className="text-black/30 text-2xl">{placeholder}</span>
        )}
      </div>
      <div className="text-sm text-black/40">
        {allCorrect ? "✓ 全部正确" : "跟着上面的灰色文字输入，错了可用退格修改"}
        {hardChars.length > 0 && `　遇到 ${hardChars.join("、")} 等特殊符号可按左上角的 \` 或 ~ 跳过`}
      </div>
      {allCorrect && (
        // 移动端回车键不一定好按，完成输入后给出可见的"下一步"按钮
        <button
          type="button"
          onClick={complete}
          className="rounded-xl bg-foreground px-8 py-2.5 text-sm font-bold text-white shadow-md"
        >
          下一步 →
        </button>
      )}
    </div>
  );
}
