import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/session";
import { hexColor } from "@/lib/theme";

// 管理员查看某用户最近学习记录
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const { id } = await params;
  const [logs, skips] = await Promise.all([
    prisma.studyLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { word: { select: { text: true, meaningCn: true } } },
    }),
    prisma.reviewSkip.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      word: l.word.text,
      meaningCn: l.word.meaningCn,
      mode: l.mode,
      result: l.result,
      createdAt: l.createdAt,
    })),
    skips: skips.map((s) => ({ id: s.id, count: s.count, createdAt: s.createdAt })),
  });
}

// 管理员修改用户属性（任务量/角色/家长学习能力/高亮色/密码/绑定孩子）
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const data: Record<string, unknown> = {};
  // 每日任务覆写：null 表示恢复全局默认
  if (body.dailyNewTarget === null) {
    data.dailyNewTarget = null;
  } else if (Number.isInteger(body.dailyNewTarget) && body.dailyNewTarget >= 1 && body.dailyNewTarget <= 200) {
    data.dailyNewTarget = body.dailyNewTarget;
  }
  if (body.dailyReviewTarget === null) {
    data.dailyReviewTarget = null;
  } else if (Number.isInteger(body.dailyReviewTarget) && body.dailyReviewTarget >= 1 && body.dailyReviewTarget <= 500) {
    data.dailyReviewTarget = body.dailyReviewTarget;
  }
  // 角色变更：仅 user ↔ parent；不可改 admin，不可改自己
  if (typeof body.role === "string") {
    if (!["user", "parent"].includes(body.role)) {
      return NextResponse.json({ error: "角色只能是 user 或 parent" }, { status: 400 });
    }
    if (target.role === "admin" || id === admin.id) {
      return NextResponse.json({ error: "不能修改该账号的角色" }, { status: 400 });
    }
    if (body.role !== target.role) {
      if (target.role === "parent" && body.role === "user") {
        const childCount = await prisma.user.count({ where: { parentId: id } });
        if (childCount > 0) {
          return NextResponse.json({ error: "该家长还有绑定的孩子，请先解绑" }, { status: 400 });
        }
      }
      data.role = body.role;
      if (body.role === "user") data.parentCanLearn = false;
    }
  }
  // 学习型家长开关
  if (typeof body.parentCanLearn === "boolean") {
    data.parentCanLearn = body.parentCanLearn;
  }
  // 高亮颜色："" 或 null 表示清除
  if (body.highlightColor === "" || body.highlightColor === null) {
    data.highlightColor = null;
  } else if (typeof body.highlightColor === "string") {
    if (hexColor(body.highlightColor) !== body.highlightColor) {
      return NextResponse.json({ error: "高亮颜色格式错误（应为 #RRGGBB）" }, { status: 400 });
    }
    data.highlightColor = body.highlightColor;
  }
  // 重置密码
  if (typeof body.newPassword === "string") {
    if (body.newPassword.length < 4) {
      return NextResponse.json({ error: "密码至少4位" }, { status: 400 });
    }
    const bcrypt = (await import("bcryptjs")).default;
    data.passwordHash = bcrypt.hashSync(body.newPassword, 10);
  }
  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id }, data });
  }
  // 绑定孩子：仅目标（变更后）是家长时有效；childIds = 选中的孩子 id 列表
  if (Array.isArray(body.childIds)) {
    const after = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (after?.role !== "parent") {
      return NextResponse.json({ error: "只有家长账号可以绑定孩子" }, { status: 400 });
    }
    const childIds = body.childIds.filter((x: unknown) => typeof x === "string") as string[];
    await prisma.$transaction([
      // 新选中的孩子绑定到该家长
      prisma.user.updateMany({ where: { id: { in: childIds }, role: "user" }, data: { parentId: id } }),
      // 原先绑定该家长但本次未选中的孩子解绑
      prisma.user.updateMany({ where: { parentId: id, id: { notIn: childIds } }, data: { parentId: null } }),
    ]);
  }
  if (!Object.keys(data).length && !Array.isArray(body.childIds)) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// 管理员删除用户：不可删 admin、不可删自己；孩子端 parentId 自动 SetNull
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.role === "admin" || id === admin.id) {
    return NextResponse.json({ error: "不能删除管理员账号" }, { status: 400 });
  }
  await prisma.$transaction([
    // 无 cascade 的关联手动清理（Book 删除会级联 Unit/Word/进度等）
    prisma.wordProgress.deleteMany({ where: { userId: id } }),
    prisma.studyLog.deleteMany({ where: { userId: id } }),
    prisma.book.deleteMany({ where: { ownerId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
