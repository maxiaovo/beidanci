// 创建 admin 账号：npx tsx scripts/seed.ts [username] [password]
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] || "admin";
  const password = process.argv[3] || "admin123";
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`用户 ${username} 已存在，跳过`);
    return;
  }
  await prisma.user.create({
    data: {
      username,
      passwordHash: bcrypt.hashSync(password, 10),
      role: "admin",
    },
  });
  console.log(`已创建管理员 ${username}（密码 ${password}，请尽快修改）`);
}

main().finally(() => prisma.$disconnect());
