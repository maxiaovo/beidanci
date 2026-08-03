import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedbackCard } from "../app/writing/page";

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
