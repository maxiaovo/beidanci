// 站点级设置（存 Setting 表）
import { prisma } from "./db";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isRegistrationOpen(): Promise<boolean> {
  return (await getSetting("registration_open", "true")) === "true";
}
