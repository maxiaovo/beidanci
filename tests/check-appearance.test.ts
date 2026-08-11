import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECK_APPEARANCE_RANGES,
  DEFAULT_CHECK_APPEARANCE,
  clampCheckAppearanceValue,
} from "../lib/appearance";

test("检查页外观：合法值取整通过", () => {
  assert.equal(clampCheckAppearanceValue("wordSizePx", 72), 72);
  assert.equal(clampCheckAppearanceValue("optionSizePx", 20.6), 21);
  assert.equal(clampCheckAppearanceValue("cardWidthPct", 90), 90);
});

test("检查页外观：超范围夹取到边界", () => {
  const [wMin, wMax] = CHECK_APPEARANCE_RANGES.wordSizePx;
  assert.equal(clampCheckAppearanceValue("wordSizePx", 1), wMin);
  assert.equal(clampCheckAppearanceValue("wordSizePx", 9999), wMax);
  const [cMin, cMax] = CHECK_APPEARANCE_RANGES.cardWidthPct;
  assert.equal(clampCheckAppearanceValue("cardWidthPct", 0), cMin);
  assert.equal(clampCheckAppearanceValue("cardWidthPct", 200), cMax);
});

test("检查页外观：非法值回落默认", () => {
  assert.equal(clampCheckAppearanceValue("wordSizePx", undefined), DEFAULT_CHECK_APPEARANCE.wordSizePx);
  assert.equal(clampCheckAppearanceValue("optionSizePx", "abc"), DEFAULT_CHECK_APPEARANCE.optionSizePx);
  // null 经 Number() 得 0，按数值处理夹到最小值（与 clampAppearanceValue 语义一致）
  assert.equal(clampCheckAppearanceValue("cardWidthPct", null), CHECK_APPEARANCE_RANGES.cardWidthPct[0]);
});
