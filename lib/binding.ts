// 家长↔孩子双向绑定邀约的纯逻辑（不依赖 prisma，便于单测）
// 规则：一方输入对方用户名产生一条邀约；同一对 (parentId, childId)
// 出现 createdBy 相反的两条邀约时，双向匹配成立，完成绑定。

export interface BindingInviteLike {
  id: string;
  parentId: string;
  childId: string;
  createdBy: string; // parent | child
}

export interface InviteInput {
  parentId: string;
  childId: string;
  createdBy: string; // parent | child
}

// 发起方角色 → 期望对方（被邀约人）的角色；不允许的角色返回 null
export function expectedTargetRole(creatorRole: string): string | null {
  if (creatorRole === "parent") return "user";
  if (creatorRole === "user") return "parent";
  return null;
}

// 在已有邀约中查找与新邀约互补（同账号对、发起方相反）的那条；找到即匹配成功
export function matchInvite(
  existing: BindingInviteLike[],
  invite: InviteInput
): BindingInviteLike | null {
  const opposite = invite.createdBy === "parent" ? "child" : "parent";
  return (
    existing.find(
      (i) =>
        i.parentId === invite.parentId &&
        i.childId === invite.childId &&
        i.createdBy === opposite
    ) ?? null
  );
}
