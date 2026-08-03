import assert from "node:assert/strict";
import test from "node:test";
import { validateWritingFeedback } from "../lib/writing-types";
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
