import { redirect } from "next/navigation";

// 旧单页后台已拆分为子路由，统一入口跳转到用户管理
export default function AdminIndexPage() {
  redirect("/admin/users");
}
