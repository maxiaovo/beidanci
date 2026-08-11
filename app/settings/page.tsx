import { redirect } from "next/navigation";

// 设置页已并入「我的」页（/me 的页签），保留此路由做兼容跳转
export default function SettingsPage() {
  redirect("/me");
}
