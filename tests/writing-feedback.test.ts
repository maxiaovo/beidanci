import assert from "node:assert/strict";
import test from "node:test";
import { validateImitationPrompt, validateWritingFeedback } from "../lib/writing-types";
import { needsLongerDiagnostic } from "../lib/writing-assessment";

const base = {
  summary: "表达清楚，但时态需要修正。",
  capability: "能用简单句描述日常经历。",
  band: "A2",
  confidence: 0.8,
  dimensions: { grammar: 3, vocabulary: 3, naturalness: 2.5, clarity: 4, register: 3 },
  strengths: ["信息完整"],
  issues: [{ category: "grammar", severity: "blocking", original: "I go yesterday", correction: "I went yesterday", explanation: "过去时间使用过去式", skillCode: "tense.past" }],
  blockingIssues: ["使用一般过去时"],
  focusResolved: false,
  improvedVersion: "I went there yesterday.",
  modelAnswer: "I went to the park yesterday.",
  hints: { keywords: ["went"], frame: "I ___ yesterday.", guidedSteps: ["先写主语", "再写过去式"] },
  memoryItems: [{ category: "grammar", skillCode: "tense.past", summary: "一般过去时", explanation: "过去事件使用过去式", exampleBefore: "I go yesterday", exampleAfter: "I went yesterday" }],
  needsLongerAssessment: false,
};

test("valid writing feedback is normalized and bounded", () => {
  const result = validateWritingFeedback({ ...base, confidence: 2, dimensions: { ...base.dimensions, grammar: 8 } });
  assert.equal(result.confidence, 1);
  assert.equal(result.dimensions.grammar, 5);
  assert.equal(result.memoryItems.length, 1);
});

test("unknown feedback categories are rejected", () => {
  assert.throws(() => validateWritingFeedback({ ...base, issues: [{ ...base.issues[0], category: "pronunciation" }] }), /未知问题类别/);
});

test("diagnostic adds a paragraph when confidence is insufficient", () => {
  const strong = validateWritingFeedback(base);
  assert.equal(needsLongerDiagnostic([strong, strong, strong]), false);
  assert.equal(needsLongerDiagnostic([strong, { ...strong, confidence: 0.2 }, { ...strong, confidence: 0.2 }]), true);
  assert.equal(needsLongerDiagnostic([strong, strong]), true);
});

const imitationPackage = {
  instruction: "仿照示范句，写一个你最近改变的习惯。",
  variation: "保留前后对照，换成你自己的习惯。",
  prewriting: {
    coach: { en: "Choose one real change before you write.", zh: "下笔前先选一个真实改变。" },
    goal: { en: "Show a clear before-and-now contrast.", zh: "写清过去和现在的对比。" },
    steps: [
      { en: "Name the old habit.", zh: "说出过去的习惯。" },
      { en: "Add the new action.", zh: "补上现在的新行动。" },
    ],
    checklist: [
      { en: "I used a real example.", zh: "我用了真实例子。" },
      { en: "The time contrast is clear.", zh: "时间对比很清楚。" },
    ],
  },
  model: {
    sentences: [{
      english: "I used to skip breakfast, but now I eat before school.",
      translationZh: "我以前不吃早餐，但现在上学前会吃东西。",
      role: { en: "It shows a change.", zh: "它呈现了一个改变。" },
      explanation: { en: "The contrast gives the sentence a simple story.", zh: "前后对比让句子有了一个小故事。" },
      pattern: "I used to ___, but now I ___.",
      pitfall: { en: "Use the base verb after used to.", zh: "used to 后面使用动词原形。" },
    }],
  },
};

test("imitation teaching packages keep complete cached bilingual content", () => {
  const result = validateImitationPrompt(imitationPackage);
  assert.equal(result.example, imitationPackage.model.sentences[0].english);
  assert.equal(result.prewriting?.steps.length, 2);
  assert.equal(result.model?.sentences[0].explanation.en, imitationPackage.model.sentences[0].explanation.en);
  assert.equal(result.model?.sentences[0].explanation.zh, imitationPackage.model.sentences[0].explanation.zh);
});

test("imitation teaching packages reject a missing Chinese explanation", () => {
  const invalid = structuredClone(imitationPackage);
  invalid.model.sentences[0].explanation.zh = "";
  assert.throws(() => validateImitationPrompt(invalid), /explanation\.zh.*不能为空/);
});
