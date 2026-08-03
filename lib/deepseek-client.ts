import { getAIConfig } from "./settings";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class DeepSeekRequestError extends Error {
  constructor(message: string, public readonly retryable = false) {
    super(message);
    this.name = "DeepSeekRequestError";
  }
}

function extractJson(content: string): unknown {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  const objectEnd = text.lastIndexOf("}");
  const arrayEnd = text.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);
  if (start < 0 || end < start) throw new DeepSeekRequestError("DeepSeek 返回内容不含 JSON", true);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new DeepSeekRequestError("DeepSeek 返回的 JSON 无法解析", true);
  }
}

export async function requestDeepSeekText(messages: DeepSeekMessage[], temperature = 0.2, maxAttempts = 2): Promise<string> {
  const cfg = await getAIConfig();
  if (!cfg.apiKey) throw new DeepSeekRequestError("DeepSeek API Key 未配置");
  const body = {
    model: cfg.model,
    messages,
    temperature,
    stream: false,
    ...(cfg.thinking ? {} : { thinking: { type: "disabled" } }),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        const retryable = res.status >= 500;
        const error = new DeepSeekRequestError(`DeepSeek HTTP ${res.status}: ${detail}`, retryable);
        if (!retryable || attempt === maxAttempts - 1) throw error;
        lastError = error;
        continue;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new DeepSeekRequestError("DeepSeek 返回内容为空", true);
      }
      return content;
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof DeepSeekRequestError) || error.retryable;
      if (!retryable || attempt === maxAttempts - 1) throw error;
    }
  }
  throw lastError;
}

export async function requestDeepSeekJson<T>(
  messages: DeepSeekMessage[],
  validate: (value: unknown) => T,
  temperature = 0.2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return validate(extractJson(await requestDeepSeekText(messages, temperature, 1)));
    } catch (error) {
      lastError = error;
      if (error instanceof DeepSeekRequestError && !error.retryable) throw error;
    }
  }
  throw lastError;
}

const writingLocks = new Set<string>();

export async function withWritingAiLock<T>(userId: string, work: () => Promise<T>): Promise<T> {
  if (writingLocks.has(userId)) throw new DeepSeekRequestError("已有写作请求正在处理中，请稍候", false);
  writingLocks.add(userId);
  try {
    return await work();
  } finally {
    writingLocks.delete(userId);
  }
}
