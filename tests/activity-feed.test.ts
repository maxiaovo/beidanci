import assert from "node:assert/strict";
import test from "node:test";
import { buildActivityItems, LIVE_WINDOW_MS, type ActivityLogInput, type ActivitySessionInput } from "../lib/activity-feed";

const now = new Date("2026-08-10T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

function log(overrides: Partial<ActivityLogInput> = {}): ActivityLogInput {
  return {
    userId: "u1",
    username: "朵朵",
    avatarUrl: null,
    mode: "learn",
    bookName: "神奇树屋",
    unitTitle: "第 3 单元",
    at: minutesAgo(5),
    ...overrides,
  };
}

function session(overrides: Partial<ActivitySessionInput> = {}): ActivitySessionInput {
  return {
    userId: "u2",
    username: "爸爸",
    avatarUrl: "a.png",
    title: "示范仿写",
    at: minutesAgo(3),
    ...overrides,
  };
}

test("empty input yields no items", () => {
  assert.deepEqual(buildActivityItems([], [], now), []);
});

test("a recent learn log becomes a live item with book and unit", () => {
  const [item] = buildActivityItems([log()], [], now);
  assert.equal(item.live, true);
  assert.equal(item.action, "正在背单词");
  assert.equal(item.detail, "《神奇树屋》· 第 3 单元");
  assert.equal(item.username, "朵朵");
});

test("a check log uses the check label without unit detail", () => {
  const [item] = buildActivityItems([log({ mode: "check-spell" })], [], now);
  assert.equal(item.action, "正在拼写检查");
  assert.equal(item.detail, "《神奇树屋》");
});

test("an active writing session becomes a live writing item", () => {
  const [item] = buildActivityItems([], [session()], now);
  assert.equal(item.live, true);
  assert.equal(item.action, "正在写作");
  assert.equal(item.detail, "示范仿写");
});

test("activity older than the live window is phrased in past tense", () => {
  const old = log({ at: minutesAgo(LIVE_WINDOW_MS / 60_000 + 10) });
  const [item] = buildActivityItems([old], [], now);
  assert.equal(item.live, false);
  assert.equal(item.action, "刚才背了单词");
});

test("each user appears once with their newest activity", () => {
  const items = buildActivityItems(
    [log({ at: minutesAgo(20) }), log({ at: minutesAgo(2) })],
    [],
    now,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].at.getTime(), minutesAgo(2).getTime());
});

test("a newer writing session beats an older word log for the same user", () => {
  const items = buildActivityItems(
    [log({ userId: "u2", username: "爸爸", at: minutesAgo(10) })],
    [session({ at: minutesAgo(4) })],
    now,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].action, "正在写作");
});

test("items are sorted newest first across users", () => {
  const items = buildActivityItems([log({ at: minutesAgo(6) })], [session({ at: minutesAgo(1) })], now);
  assert.deepEqual(items.map((i) => i.username), ["爸爸", "朵朵"]);
});
