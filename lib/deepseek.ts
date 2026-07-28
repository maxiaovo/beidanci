// DeepSeek v4-pro：把单元原始文本分析成结构化单词 JSON
export interface AnalyzedWord {
  text: string;
  phonetic: string;
  pos: string;
  meaningCn: string;
  meaningEn: string;
  segments: { part: string; type: "prefix" | "root" | "suffix" | "word"; meaningCn: string }[];
  mnemonic: string;
  example1: string;
  example1Cn: string;
  example2: string;
  example2Cn: string;
}

const PROMPT = `你是英语词汇教学专家。下面是某课程单元的原始词汇文本，可能格式杂乱。
请提取每一个单词/词组，输出严格的 JSON 数组（不要输出任何其他文字、不要用 markdown 代码块），每个元素字段如下：
- text: 单词原形（小写，词组保留空格）
- phonetic: 英式音标，带斜杠，如 /ˈæn.θər/
- pos: 词性缩写，如 n. v. adj. phrase
- meaningCn: 中文释义（简明，多个义项用；分隔）
- meaningEn: 英文释义（简明，适合六年级学生）
- segments: 词根词缀切分数组，把单词拆成 前缀/词根/后缀，每段 {part, type, meaningCn}；type 只能是 "prefix"|"root"|"suffix"|"word"；无法拆解的简单词就给单元素数组 type 为 "word"，meaningCn 为整体释义；所有 part 拼接起来必须严格等于 text（词组按空格拆成各单词即可）
- mnemonic: 词根词缀记忆法，中文，一两句话说明构词逻辑
- example1/example2: 两个英文例句（简单地道，适合六年级，必须包含该单词）
- example1Cn/example2Cn: 对应中文翻译

原始文本：
---
%s
---`;

export async function analyzeUnitText(rawText: string): Promise<AnalyzedWord[]> {
  const url = `${process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`;
  const body = {
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
    messages: [{ role: "user", content: PROMPT.replace("%s", rawText) }],
    temperature: 0.2,
    stream: false,
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      return parseWordsJson(content);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function parseWordsJson(content: string): AnalyzedWord[] {
  let text = content.trim();
  // 去掉可能的 markdown 代码块包裹
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("DeepSeek 返回内容不含 JSON 数组");
  const arr = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error("DeepSeek 返回不是数组");
  return arr
    .filter((w) => w && typeof w.text === "string" && w.text.trim())
    .map((w) => ({
      text: String(w.text).trim().toLowerCase(),
      phonetic: String(w.phonetic ?? ""),
      pos: String(w.pos ?? ""),
      meaningCn: String(w.meaningCn ?? ""),
      meaningEn: String(w.meaningEn ?? ""),
      segments: normalizeSegments(w),
      mnemonic: String(w.mnemonic ?? ""),
      example1: String(w.example1 ?? ""),
      example1Cn: String(w.example1Cn ?? ""),
      example2: String(w.example2 ?? ""),
      example2Cn: String(w.example2Cn ?? ""),
    }));
}

function normalizeSegments(w: { text: string; segments?: unknown }): AnalyzedWord["segments"] {
  const valid = ["prefix", "root", "suffix", "word"] as const;
  type T = (typeof valid)[number];
  const segs = Array.isArray(w.segments) ? w.segments : [];
  const out: { part: string; type: T; meaningCn: string }[] = [];
  for (const s of segs) {
    if (!s || typeof s.part !== "string" || !s.part.trim()) continue;
    const type = valid.includes(s.type) ? (s.type as T) : "root";
    out.push({ part: s.part.trim().toLowerCase(), type, meaningCn: String(s.meaningCn ?? "") });
  }
  // 拼接校验：拼不回原词则退化为整体
  const joined = out.map((s) => s.part).join(w.text.includes(" ") ? " " : "");
  if (!out.length || joined !== w.text) {
    return [{ part: w.text, type: "word", meaningCn: String((w as { meaningCn?: string }).meaningCn ?? "") }];
  }
  return out;
}
