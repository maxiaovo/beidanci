import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE_NAME = "vocab_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

function secret(): string {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createSession(userId: string) {
  const payload = `${userId}.${Date.now()}`;
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  const userId = payload.split(".")[0];
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}

// 家长（parent）不参与学习：学习者接口用它拦截
export function isParent(user: { role: string }) {
  return user.role === "parent";
}

// 能否查看/管理某个孩子：管理员可以管所有人；家长只能管自己绑定的孩子
export async function canAccessChild(viewer: { id: string; role: string }, childId: string) {
  if (viewer.role === "admin") return true;
  if (viewer.role !== "parent") return false;
  const child = await prisma.user.findUnique({ where: { id: childId }, select: { parentId: true } });
  return child?.parentId === viewer.id;
}

// 家长接口的可见孩子范围：家长=自己的孩子；管理员=所有学习者
export async function listChildUsers(viewer: { id: string; role: string }) {
  if (viewer.role === "admin") {
    return prisma.user.findMany({ where: { role: "user" }, orderBy: { createdAt: "asc" } });
  }
  return prisma.user.findMany({ where: { parentId: viewer.id }, orderBy: { createdAt: "asc" } });
}
