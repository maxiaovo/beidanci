import type { useRouter } from "next/navigation";

export type AdminRouter = ReturnType<typeof useRouter>;

// 管理后台通用 GET：401 跳登录页、403 跳首页；发生跳转时返回 null
export async function adminGet(url: string, router: AdminRouter): Promise<Response | null> {
  const r = await fetch(url);
  if (r.status === 401) {
    router.push("/login");
    return null;
  }
  if (r.status === 403) {
    router.push("/");
    return null;
  }
  return r;
}
