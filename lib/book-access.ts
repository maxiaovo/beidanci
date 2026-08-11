import { prisma } from "./db";

// 词书可见性：自己的书 | 分配给所有人的书 | 分配给自己的书
export function bookVisibleWhere(userId: string) {
  return {
    OR: [
      { ownerId: userId },
      { sharedWithAll: true },
      { assignments: { some: { userId } } },
    ],
  };
}

// 单本书可见性判断：管理员 | 自己的书 | 全员共享 | 分配给我 | 我已加入学习
export async function canAccessBook(user: { id: string; role: string }, bookId: string) {
  if (user.role === "admin") return true;
  const book = await prisma.book.findFirst({
    where: {
      id: bookId,
      OR: [
        { ownerId: user.id },
        { sharedWithAll: true },
        { assignments: { some: { userId: user.id } } },
        { bookEnrollments: { some: { userId: user.id } } },
      ],
    },
    select: { id: true },
  });
  return !!book;
}

// 在学过滤：只有被用户加入学习的书才参与新词下发与每日计划
export function bookEnrolledWhere(userId: string) {
  return { bookEnrollments: { some: { userId } } };
}
