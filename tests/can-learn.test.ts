import assert from "node:assert/strict";
import test from "node:test";
import { canLearn } from "../lib/session";

test("canLearn: 普通用户和管理员总是可以学习", () => {
  assert.equal(canLearn({ role: "user" }), true);
  assert.equal(canLearn({ role: "admin" }), true);
});

test("canLearn: 普通家长默认不能学习", () => {
  assert.equal(canLearn({ role: "parent" }), false);
  assert.equal(canLearn({ role: "parent", parentCanLearn: false }), false);
  assert.equal(canLearn({ role: "parent", parentCanLearn: null }), false);
});

test("canLearn: 学习型家长可以学习", () => {
  assert.equal(canLearn({ role: "parent", parentCanLearn: true }), true);
});
