import { getAIConfig } from "./settings";
import {
  describeAiResource,
  findAiResource,
  storeAiResource,
  type AiResourceIdentity,
} from "./ai-resources";

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

interface DeepSeekRuntimeConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  thinking: boolean;
}

export interface DeepSeekResourceResult {
  content: string;
  cached: boolean;
  cacheKey: string;
}

async function fetchDeepSeekText(
  cfg: DeepSeekRuntimeConfig,
  messages: DeepSeekMessage[],
  temperature: number,
): Promise<string> {
  if (!cfg.apiKey) throw new DeepSeekRequestError("DeepSeek API Key 未配置");
  const body = {
    model: cfg.model,
    messages,
    temperature,
    stream: false,
    ...(cfg.thinking ? {} : { thinking: { type: "disabled" } }),
  };

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
    throw new DeepSeekRequestError(`DeepSeek HTTP ${res.status}: ${detail}`, res.status >= 500);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new DeepSeekRequestError("DeepSeek 返回内容为空", true);
  }
  return content;
}

const inFlightResources = new Map<string, Promise<string>>();

async function requestDeepSeekResource(
  identity: AiResourceIdentity,
  cfg: DeepSeekRuntimeConfig,
  maxAttempts: number,
  validateContent?: (content: string) => unknown,
): Promise<DeepSeekResourceResult> {
  const lookup = describeAiResource(identity);
  const cached = await findAiResource(identity);
  if (cached) {
    try {
      validateContent?.(cached.content);
      return { content: cached.content, cached: true, cacheKey: cached.cacheKey };
    } catch {
      // 旧缓存若不符合新的校验规则，就用同一缓存键重新生成并覆盖。
    }
  }

  const running = inFlightResources.get(lookup.cacheKey);
  if (running) {
    const content = await running;
    validateContent?.(content);
    return { content, cached: true, cacheKey: lookup.cacheKey };
  }

  const work = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const content = await fetchDeepSeekText(cfg, identity.messages, identity.temperature);
        validateContent?.(content);
        await storeAiResource(identity, content);
        return content;
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof DeepSeekRequestError) || error.retryable;
        if (!retryable || attempt === maxAttempts - 1) throw error;
      }
    }
    throw lastError;
  })();
  inFlightResources.set(lookup.cacheKey, work);
  try {
    return { content: await work, cached: false, cacheKey: lookup.cacheKey };
  } finally {
    inFlightResources.delete(lookup.cacheKey);
  }
}

export async function requestDeepSeekTextWithMeta(
  featureKey: string,
  messages: DeepSeekMessage[],
  temperature = 0.2,
  maxAttempts = 2,
  validateContent?: (content: string) => unknown,
): Promise<DeepSeekResourceResult> {
  const cfg = await getAIConfig();
  return requestDeepSeekResource({
    featureKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    thinking: cfg.thinking,
    temperature,
    messages,
  }, cfg, maxAttempts, validateContent);
}

export async function requestDeepSeekText(
  featureKey: string,
  messages: DeepSeekMessage[],
  temperature = 0.2,
  maxAttempts = 2,
  validateContent?: (content: string) => unknown,
): Promise<string> {
  return (await requestDeepSeekTextWithMeta(featureKey, messages, temperature, maxAttempts, validateContent)).content;
}

export async function requestDeepSeekJson<T>(
  featureKey: string,
  messages: DeepSeekMessage[],
  validate: (value: unknown) => T,
  temperature = 0.2,
): Promise<T> {
  const cfg = await getAIConfig();
  const result = await requestDeepSeekResource({
    featureKey,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    thinking: cfg.thinking,
    temperature,
    messages,
  }, cfg, 2, (content) => validate(extractJson(content)));
  return validate(extractJson(result.content));
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
