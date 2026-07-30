"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playGua } from "@/lib/client";

// 容易输入的 ASCII 标点/空格；字母、数字以及这些之外的字符视为"难打符号"
const EASY_CHARS = new Set(" .,;:'\"?!()-/&@#%$*+=<>[]{}\\|_^".split(""));
function isHardChar(c: string) {
  if (/\p{L}/u.test(c) || /\d/.test(c)) return false;
  return !EASY_CHARS.has(c);
}

// 临摹输入：目标文本浅灰显示，逐字符键入；正确黑、错误红+抖动
// 全部正确后按回车触发 onComplete
export default function TypingTrainer({
  target,
  onComplete,
  fontSize = "text-5xl",
  placeholder = "开始输入…",
}: {
  target: string;
  onComplete: () => void;
  fontSize?: string;
  placeholder?: string;
}) {
  const [typed, setTyped] = useState<string>("");
  const [shake, setShake] = useState(0);
  // 空格位置输错的下标集合：这些位置渲染 💩
  const [wrongSpaces, setWrongSpaces] = useState<Set<number>>(new Set());
  const doneRef = useRef(false);

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

  useEffect(() => {
    doneRef.current = false;
    setTyped("");
    setWrongSpaces(new Set());
  }, [target]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace") {
        setTyped((t) => t.slice(0, -1));
        setWrongSpaces((s) => {
          if (!s.has(typed.length - 1)) return s;
          const next = new Set(s);
          next.delete(typed.length - 1);
          return next;
        });
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        if (allCorrect && !doneRef.current) {
          doneRef.current = true;
          onComplete();
        }
        e.preventDefault();
        return;
      }
      if (e.key.length !== 1) return;
      if (typed.length >= target.length) return;
      const expected = target[typed.length];
      // 难打符号：按 ` 或 ~ 直接填入正确字符（算对）
      if ((e.key === "`" || e.key === "~") && isHardChar(expected)) {
        setTyped((t) => t + expected);
        e.preventDefault();
        return;
      }
      if (!isMatch(e.key, expected)) {
        if (expected === " ") {
          // 空格位置输错：渲染 💩 + 呱
          const idx = typed.length;
          setWrongSpaces((s) => new Set(s).add(idx));
          playGua();
        } else {
          setShake((s) => s + 1);
        }
      }
      setTyped((t) => t + e.key);
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typed, target, allCorrect, isMatch, onComplete]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        key={shake}
        className={`${shake > 0 ? "animate-shake" : ""} ${fontSize} font-mono font-bold leading-relaxed tracking-wider text-center max-w-3xl flex flex-wrap justify-center`}
      >
        {target.split("").map((c, i) => {
          let cls = "text-black/15"; // 未输入：浅灰
          const isWrongSpace = wrongSpaces.has(i);
          if (i < typed.length) {
            cls = isMatch(typed[i], c) ? "text-black" : "text-red-500";
          }
          const isCursor = i === typed.length;
          return (
            <span key={i} className="relative">
              <span className={isWrongSpace ? "" : cls}>{isWrongSpace ? "💩" : c === " " ? " " : c}</span>
              {isCursor && (
                <span className="cursor-blink absolute -bottom-1 left-0 right-0 h-1 bg-blue-400 rounded" />
              )}
            </span>
          );
        })}
        {typed.length === 0 && target.length === 0 && (
          <span className="text-black/30 text-2xl">{placeholder}</span>
        )}
      </div>
      <div className="text-sm text-black/40">
        {allCorrect ? "✓ 全部正确，按回车继续" : "跟着上面的灰色文字输入，错了可用退格修改"}
        {hardChars.length > 0 && `　遇到 ${hardChars.join("、")} 等特殊符号可按左上角的 \` 或 ~ 跳过`}
      </div>
    </div>
  );
}
