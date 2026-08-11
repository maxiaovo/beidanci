import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE_NAME = "vocab_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  // 生产环境缺失密钥直接抛错，绝不回落到公开默认值（否则任何人都能伪造 session）
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET 未配置，生产环境拒绝启动会话签名");
  }
  return "dev-secret-change-me";
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
    secure: process.env.NODE_ENV === "production", // 生产站走 HTTPS，禁止明文传输
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

// 认证/授权失败：携带 HTTP 状态码，调用方可区分 401（未登录）与 403（已登录但权限不足）
export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "未登录");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError(403, "无管理员权限");
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
