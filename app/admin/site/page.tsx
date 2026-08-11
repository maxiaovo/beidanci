import DailyWordManager from "@/components/DailyWordManager";
import SiteAppearance from "@/components/admin/SiteAppearance";
import SiteInfo from "@/components/admin/SiteInfo";
import SystemUpdate from "@/components/admin/SystemUpdate";

export default function AdminSitePage() {
  return (
    <>
      <SiteAppearance />
      <SiteInfo />
      <SystemUpdate />
      <DailyWordManager title="首页每日自然单词" />
    </>
  );
}
