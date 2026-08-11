"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet } from "./admin-utils";

// 学习设置：强检查 + 允许跳过复习（全局开关）
export default function LearningAdmin() {
  const [strict, setStrict] = useState(false);
  const [allowSkip, setAllowSkip] = useState(false); // 允许学习者跳过复习
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  const load = useCallback(() => {
    adminGet("/api/admin/config", router).then(async (r) => {
      if (!r || !r.ok) return;
      const d = await r.json();
      setStrict(!!d.strictCheck);
      setAllowSkip(!!d.allowSkipReview);
      setLoaded(true);
    });
  }, [router]);

  useEffect(load, [load]);

  async function toggleStrict() {
    const nextVal = !strict;
    setStrict(nextVal);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strictCheck: nextVal }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setStrict(!nextVal); // 保存失败，回滚开关
      alert("强检查设置保存失败，请重试");
    }
  }

  async function toggleAllowSkip() {
    const nextVal = !allowSkip;
    setAllowSkip(nextVal);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowSkipReview: nextVal }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setAllowSkip(!nextVal); // 保存失败，回滚开关
      alert("跳过复习设置保存失败，请重试");
    }
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <section className="bg-white rounded-2xl shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-xl">学习设置</h1>
      </div>
      <div className="flex flex-col gap-4 max-w-3xl">
        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
          <span className="text-black/60">强检查</span>
          <button
            onClick={toggleStrict}
            className={`w-11 h-6 rounded-full relative transition-colors ${strict ? "bg-green-400" : "bg-black/20"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                strict ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-black/40">
            {strict ? "已开启：拼写检查和选择检查都答对才算检查通过" : "已关闭"}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
          <span className="text-black/60">允许跳过复习</span>
          <button
            onClick={toggleAllowSkip}
            className={`w-11 h-6 rounded-full relative transition-colors ${allowSkip ? "bg-green-400" : "bg-black/20"}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                allowSkip ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-black/40">
            {allowSkip ? "已开启：学习者可跳过当天复习门禁（每次跳过都会记录在案）" : "已关闭：必须先完成复习才能学新词"}
          </span>
        </label>
        <p className="text-xs text-black/40">开关保存后立即对所有学习者生效。</p>
      </div>
    </section>
  );
}
