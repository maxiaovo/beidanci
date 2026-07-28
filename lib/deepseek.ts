// DeepSeek：把单元原始文本分析成结构化单词 JSON
// 模型/Key/提示词优先取管理员在 Setting 表中的配置，默认 deepseek-v4-flash、关闭思考模式
import { getAIConfig } from "./settings";

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

export async function analyzeUnitText(rawText: string): Promise<AnalyzedWord[]> {
  const cfg = await getAIConfig();
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages: [{ role: "user", content: cfg.prompt.replace("%s", rawText) }],
    temperature: 0.2,
    stream: false,
    // 思考模式：默认关闭（DeepSeek v4 系列支持 thinking 参数）
    ...(cfg.thinking ? {} : { thinking: { type: "disabled" } }),
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
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
