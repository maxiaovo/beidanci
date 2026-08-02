import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { RecallActions } from "../app/check/page";

const noop = () => {};

test("学生尚未作答时可以直接表示想不起来", () => {
  const html = renderToStaticMarkup(
    <RecallActions
      revealed={false}
      word="example"
      phonetic="/ɪɡˈzɑːmpəl/"
      onReveal={noop}
      onNext={noop}
    />,
  );

  assert.match(html, /想不起来，查看答案/);
  assert.doesNotMatch(html, /下一个/);
});

test("学生表示想不起来后会看到答案并可继续", () => {
  const html = renderToStaticMarkup(
    <RecallActions
      revealed
      word="example"
      phonetic="/ɪɡˈzɑːmpəl/"
      onReveal={noop}
      onNext={noop}
    />,
  );

  assert.match(html, /example/);
  assert.match(html, /ɪɡˈzɑːmpəl/);
  assert.match(html, /下一个/);
  assert.doesNotMatch(html, /想不起来，查看答案/);
});

test("选择题表示想不起来后会揭晓中文答案", () => {
  const html = renderToStaticMarkup(
    <RecallActions
      revealed
      mode="choice"
      word="example"
      meaningCn="例子"
      phonetic="/ɪɡˈzɑːmpəl/"
      onReveal={noop}
      onNext={noop}
    />,
  );

  assert.match(html, /例子/);
  assert.match(html, /example/);
  assert.match(html, /下一个/);
});
