import assert from "node:assert/strict";
import test from "node:test";
import { expectedTargetRole, matchInvite } from "../lib/binding";

test("expectedTargetRole: 家长邀约学生，学生邀约家长", () => {
  assert.equal(expectedTargetRole("parent"), "user");
  assert.equal(expectedTargetRole("user"), "parent");
  assert.equal(expectedTargetRole("admin"), null);
  assert.equal(expectedTargetRole(""), null);
});

test("matchInvite: 双向邀约互相匹配", () => {
  const existing = [
    { id: "inv1", parentId: "p1", childId: "c1", createdBy: "parent" },
  ];
  // 孩子再输入同一家长的用户名 → 匹配
  const hit = matchInvite(existing, { parentId: "p1", childId: "c1", createdBy: "child" });
  assert.equal(hit?.id, "inv1");
});

test("matchInvite: 同方向重复邀约不匹配", () => {
  const existing = [
    { id: "inv1", parentId: "p1", childId: "c1", createdBy: "parent" },
  ];
  const hit = matchInvite(existing, { parentId: "p1", childId: "c1", createdBy: "parent" });
  assert.equal(hit, null);
});

test("matchInvite: 账号对不一致不匹配", () => {
  const existing = [
    { id: "inv1", parentId: "p1", childId: "c1", createdBy: "parent" },
    { id: "inv2", parentId: "p2", childId: "c1", createdBy: "parent" },
  ];
  // 孩子 c1 输入的是 p3 → 不匹配任何一条
  assert.equal(
    matchInvite(existing, { parentId: "p3", childId: "c1", createdBy: "child" }),
    null
  );
  // p2 邀约了 c1，c1 输入 p2 → 匹配 inv2 而不是 inv1
  assert.equal(
    matchInvite(existing, { parentId: "p2", childId: "c1", createdBy: "child" })?.id,
    "inv2"
  );
});

test("matchInvite: 空列表返回 null", () => {
  assert.equal(matchInvite([], { parentId: "p1", childId: "c1", createdBy: "child" }), null);
});
