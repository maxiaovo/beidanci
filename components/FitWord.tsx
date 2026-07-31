"use client";

import { useLayoutEffect, useRef, useState } from "react";

// 单词单行展示：任何字号下都绝不从单词中间换行。
// 先按期望字号测量自然宽度，超出可用宽度时按比例缩小字号（临时大小限制），
// 保证再长的单词也完整显示在一行内；窗口尺寸变化时重新测量。
export default function FitWord({
  text,
  sizePx,
  className,
  minPx = 14,
}: {
  text: string;
  sizePx: number; // 期望字号（px），实际渲染不超过该值
  className?: string;
  minPx?: number; // 缩小下限
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fitPx, setFitPx] = useState(sizePx);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // nowrap 下 scrollWidth 即内容自然宽度，clientWidth 受 max-width 限制即可用宽度
      el.style.fontSize = `${sizePx}px`;
      const natural = el.scrollWidth;
      const avail = el.clientWidth;
      if (natural > 0 && avail > 0 && natural > avail) {
        setFitPx(Math.max(minPx, Math.floor((sizePx * avail) / natural)));
      } else {
        setFitPx(sizePx);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, sizePx, minPx]);

  return (
    <span
      ref={ref}
      className={className}
      style={{
        fontSize: `${fitPx}px`,
        whiteSpace: "nowrap",
        display: "inline-block",
        maxWidth: "100%",
      }}
    >
      {text}
    </span>
  );
}
