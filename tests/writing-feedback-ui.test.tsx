import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackCard, ImitationRitual, TeachingScaffold } from "../app/writing/page";
import type { WritingPrompt } from "../lib/writing-types";

test("feedback shows strengths before categorized improvements", () => {
  const html = renderToStaticMarkup(<FeedbackCard passed={false} feedback={{
    summary: "意思清楚，再修正一个时态问题。",
    strengths: ["把时间和地点交代清楚了"],
    issues: [{ category: "grammar", severity: "blocking", original: "I go yesterday", correction: "I went yesterday", explanation: "昨天发生的事使用过去式。" }],
    improvedVersion: "I went there yesterday.",
  }} />);
  assert.match(html, /做得好的地方/);
  assert.match(html, /语法/);
  assert.match(html, /必须改/);
  assert.ok(html.indexOf("做得好的地方") < html.indexOf("语法"));
});

test("imitation teaching starts in English with Chinese translation hidden behind T", () => {
  const prompt: WritingPrompt = {
    instruction: "仿写一句。",
    variation: "换一个习惯。",
    prewriting: {
      coach: { en: "Choose one real change.", zh: "选择一个真实改变。" },
      goal: { en: "Build a contrast.", zh: "写出对比。" },
      steps: [{ en: "Name the past.", zh: "说明过去。" }, { en: "Name the present.", zh: "说明现在。" }],
      checklist: [{ en: "The change is clear.", zh: "变化很清楚。" }, { en: "The verb form is correct.", zh: "动词形式正确。" }],
    },
    model: { sentences: [{
      english: "I used to skip breakfast, but now I eat before school.",
      translationZh: "我以前不吃早餐，但现在上学前会吃东西。",
      role: { en: "It shows a change.", zh: "它呈现变化。" },
      explanation: { en: "The contrast gives the sentence a story.", zh: "对比让句子有了故事。" },
      pattern: "I used to ___, but now I ___.",
      pitfall: { en: "Use the base verb after used to.", zh: "used to 后用动词原形。" },
    }] },
  };
  const html = renderToStaticMarkup(<TeachingScaffold prompt={prompt} showExample setShowExample={() => {}} />);
  assert.match(html, /Choose one real change/);
  assert.match(html, /The contrast gives the sentence a story/);
  assert.match(html, /aria-label="显示中文翻译"/);
  assert.match(html, />T<\/button>/);
  assert.doesNotMatch(html, /我以前不吃早餐/);
  assert.doesNotMatch(html, /对比让句子有了故事/);
});

test("imitation ritual starts focused on the model sentence", () => {
  const prompt: WritingPrompt = {
    instruction: "仿写一句。",
    variation: "换一个习惯。",
    model: { sentences: [{
      english: "I used to skip breakfast, but now I eat before school.",
      translationZh: "我以前不吃早餐，但现在上学前会吃东西。",
      role: { en: "It shows a change.", zh: "它呈现变化。" },
      explanation: { en: "The contrast gives the sentence a story.", zh: "对比让句子有了故事。" },
      pattern: "I used to ___, but now I ___.",
      pitfall: { en: "Use the base verb after used to.", zh: "used to 后用动词原形。" },
    }] },
  };
  const html = renderToStaticMarkup(<ImitationRitual prompt={prompt} onDone={() => {}} />);
  for (const stage of ["看示范", "默写", "对照", "仿写"]) assert.match(html, new RegExp(stage));
  assert.match(html, /I used to skip breakfast/);
  assert.match(html, /我记住了，开始默写/);
  // 中文翻译默认不出现，保持聚焦
  assert.doesNotMatch(html, /我以前不吃早餐/);
});
