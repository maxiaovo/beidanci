// 例句中高亮目标单词：优先整词匹配（前后为非字母边界），否则退化为子串匹配，找不到则原样渲染
function findRange(sentence: string, word: string): [number, number] | null {
  if (!word) return null;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|[^\\p{L}])(${esc})(?=$|[^\\p{L}])`, "iu").exec(sentence);
  if (m) {
    const start = m.index + m[1].length;
    return [start, start + m[2].length];
  }
  const i = sentence.toLowerCase().indexOf(word.toLowerCase());
  return i >= 0 ? [i, i + word.length] : null;
}

export default function HighlightedSentence({
  sentence,
  word,
  color,
  className,
}: {
  sentence: string;
  word: string;
  color?: string | null;
  className?: string;
}) {
  const range = findRange(sentence, word);
  if (!range) return <span className={className}>{sentence}</span>;
  const [start, end] = range;
  const matched = sentence.slice(start, end);
  return (
    <span className={className}>
      {sentence.slice(0, start)}
      {color ? (
        <span style={{ color }} className="font-bold">
          {matched}
        </span>
      ) : (
        <span className="text-accent font-bold">{matched}</span>
      )}
      {sentence.slice(end)}
    </span>
  );
}
