import { createHash } from "node:crypto";
import { prisma } from "./db";
import type { DeepSeekMessage } from "./deepseek-client";

export interface AiResourceIdentity {
  featureKey: string;
  model: string;
  baseUrl: string;
  thinking: boolean;
  temperature: number;
  messages: DeepSeekMessage[];
}

export interface AiResourceLookup {
  cacheKey: string;
  promptHash: string;
  inputHash: string;
  request: string;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function describeAiResource(identity: AiResourceIdentity): AiResourceLookup {
  const normalized = {
    version: 1,
    featureKey: identity.featureKey,
    model: identity.model,
    baseUrl: identity.baseUrl.replace(/\/+$/, ""),
    thinking: identity.thinking,
    temperature: identity.temperature,
    messages: identity.messages,
  };
  const request = JSON.stringify(normalized);
  const systemText = identity.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const inputText = identity.messages.filter((message) => message.role !== "system").map((message) => `${message.role}:${message.content}`).join("\n");
  return {
    cacheKey: hash(request),
    promptHash: hash(systemText),
    inputHash: hash(inputText),
    request,
  };
}

export async function findAiResource(identity: AiResourceIdentity): Promise<{ content: string; cacheKey: string } | null> {
  const lookup = describeAiResource(identity);
  const resource = await prisma.aiResource.findUnique({ where: { cacheKey: lookup.cacheKey } });
  if (!resource) return null;
  await prisma.aiResource.update({
    where: { cacheKey: lookup.cacheKey },
    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  return { content: resource.response, cacheKey: lookup.cacheKey };
}

export async function storeAiResource(identity: AiResourceIdentity, content: string): Promise<string> {
  const lookup = describeAiResource(identity);
  await prisma.aiResource.upsert({
    where: { cacheKey: lookup.cacheKey },
    create: {
      cacheKey: lookup.cacheKey,
      featureKey: identity.featureKey,
      model: identity.model,
      promptHash: lookup.promptHash,
      inputHash: lookup.inputHash,
      request: lookup.request,
      response: content,
    },
    update: {
      response: content,
      model: identity.model,
      promptHash: lookup.promptHash,
      inputHash: lookup.inputHash,
      request: lookup.request,
      lastUsedAt: new Date(),
    },
  });
  return lookup.cacheKey;
}

export async function getAiResourceStats() {
  const rows = await prisma.aiResource.groupBy({
    by: ["featureKey"],
    _count: { _all: true },
    _sum: { useCount: true },
  });
  return Object.fromEntries(rows.map((row) => [row.featureKey, {
    resources: row._count._all,
    cacheHits: row._sum.useCount ?? 0,
  }]));
}
