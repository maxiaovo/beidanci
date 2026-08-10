import assert from "node:assert/strict";
import test from "node:test";
import { diffWords, normalizeToken } from "../lib/word-diff";

const ORIGINAL = "Although my spoken English has been rather dormant for years, the underlying framework is still intact and, I suspect, will resurface with a bit of deliberate practice.";

test("identical recall reports no differences", () => {
  const result = diffWords(ORIGINAL, ORIGINAL);
  assert.equal(result.identical, true);
  assert.equal(result.spelling.length, 0);
  assert.equal(result.wording.length, 0);
  assert.ok(result.segments.every((s) => s.kind === "match"));
});

test("a single misspelling is classified as spelling, not wording", () => {
  const recall = ORIGINAL.replace("resurface", "resuface");
  const result = diffWords(recall, ORIGINAL);
  assert.equal(result.identical, false);
  assert.deepEqual(result.spelling, [{ wrote: "resuface", expected: "resurface" }]);
  assert.equal(result.wording.length, 0);
  assert.equal(result.missing.length, 0);
  assert.equal(result.extra.length, 0);
});

test("case and punctuation differences still count as a match", () => {
  const recall = "although my spoken english has been rather dormant for years the underlying framework is still intact and i suspect will resurface with a bit of deliberate practice";
  const result = diffWords(recall, ORIGINAL);
  assert.equal(result.identical, true);
});

test("a swapped word is classified as wording", () => {
  const recall = ORIGINAL.replace("dormant", "sleeping");
  const result = diffWords(recall, ORIGINAL);
  assert.deepEqual(result.wording, [{ wrote: "sleeping", expected: "dormant" }]);
  assert.equal(result.spelling.length, 0);
});

test("a dropped word is reported as missing", () => {
  const recall = ORIGINAL.replace("underlying framework", "framework");
  const result = diffWords(recall, ORIGINAL);
  assert.deepEqual(result.missing, ["underlying"]);
  assert.equal(result.identical, false);
});

test("an added word is reported as extra", () => {
  const recall = ORIGINAL.replace("still intact", "still totally intact");
  const result = diffWords(recall, ORIGINAL);
  assert.deepEqual(result.extra, ["totally"]);
});

test("short unrelated words are wording even at small edit distance", () => {
  const result = diffWords("I am happy", "I am sad");
  assert.deepEqual(result.wording, [{ wrote: "happy", expected: "sad" }]);
  const short = diffWords("I a happy", "I am happy");
  assert.deepEqual(short.wording, [{ wrote: "a", expected: "am" }]);
  assert.equal(short.spelling.length, 0);
});

test("normalizeToken strips surrounding punctuation and lowercases", () => {
  assert.equal(normalizeToken("Years,"), "years");
  assert.equal(normalizeToken("(Hello)"), "hello");
  assert.equal(normalizeToken("practice."), "practice");
});

test("empty recall reports every original word as missing", () => {
  const result = diffWords("", "one two three");
  assert.deepEqual(result.missing, ["one", "two", "three"]);
  assert.equal(result.identical, false);
});
