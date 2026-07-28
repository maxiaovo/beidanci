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
