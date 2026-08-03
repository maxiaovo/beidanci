import assert from "node:assert/strict";
import test from "node:test";
import { AI_PROMPT_DEFINITIONS } from "../lib/ai-prompts";
import { describeAiResource, type AiResourceIdentity } from "../lib/ai-resources";

const identity: AiResourceIdentity = {
  featureKey: "writing.imitation",
  model: "deepseek-v4-flash",
  baseUrl: "https://api.deepseek.com/",
  thinking: false,
  temperature: 0.5,
  messages: [
    { role: "system", content: "Make a teaching package." },
    { role: "user", content: "A2 learner" },
  ],
};

test("identical DeepSeek work resolves to the same reusable resource key", () => {
  assert.equal(describeAiResource(identity).cacheKey, describeAiResource(structuredClone(identity)).cacheKey);
});

test("prompt, input, model and feature changes invalidate the resource key", () => {
  const original = describeAiResource(identity).cacheKey;
  const variants: AiResourceIdentity[] = [
    { ...identity, featureKey: "writing.task_hints" },
    { ...identity, model: "deepseek-v5" },
    { ...identity, messages: [{ role: "system", content: "A revised prompt." }, identity.messages[1]] },
    { ...identity, messages: [identity.messages[0], { role: "user", content: "B1 learner" }] },
  ];
  for (const variant of variants) assert.notEqual(describeAiResource(variant).cacheKey, original);
});

test("every current DeepSeek feature is represented in the prompt registry", () => {
  const keys = AI_PROMPT_DEFINITIONS.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(keys, [
    "vocabulary.unit_analysis",
    "writing.evaluate",
    "writing.topics",
    "writing.translation_chat",
    "writing.imitation",
    "writing.task_hints",
    "writing.review_prompts",
  ]);
});
