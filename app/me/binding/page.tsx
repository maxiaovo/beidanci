"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Link as LinkIcon, UserCirclePlus, Users } from "@phosphor-icons/react";

interface InviteItem {
  id: string;
  username: string;
  createdAt: string;
}

interface BindingData {
  role: string;
  bound: {
    parent?: { id: string; username: string } | null;
    children?: { id: string; username: string }[];
  };
  outgoing: InviteItem[];
  incoming: InviteItem[];
}

export default function BindingPage() {
  const [data, setData] = useState<BindingData | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPwd, setParentPwd] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const r = await fetch("/api/binding");
    if (r.status === 401) {
      router.replace("/login");
      return;
    }
    setData(await r.json());
  }, [router]);

  useEffect(() => {
    fetch("/api/binding").then(async (r) => {
      if (r.status === 401) {
        router.replace("/login");
        return;
      }
      setData(await r.json());
    });
  }, [router]);

  async function sendInvite() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/binding/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: inviteName.trim() }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({
        ok: true,
        text: d.matched
          ? `绑定成功！你已和 ${d.username} 完成绑定。`
          : `已向 ${d.username} 发出邀约，请提醒对方在「账号绑定」页输入你的用户名完成绑定。`,
      });
      setInviteName("");
      await load();
    } else {
      setMsg({ ok: false, text: d.error || "操作失败" });
    }
    setBusy(false);
  }

  async function registerParent() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/binding/register-parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: parentName.trim(), password: parentPwd }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsg({ ok: true, text: `家长账号 ${d.username} 注册成功，已自动完成绑定。家长用该账号登录即可。` });
      setParentName("");
      setParentPwd("");
      await load();
    } else {
      setMsg({ ok: false, text: d.error || "注册失败" });
    }
    setBusy(false);
  }

  async function unbind(childId?: string) {
    if (!confirm("确定解除绑定吗？")) return;
    const r = await fetch("/api/binding/unbind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(childId ? { childId } : {}),
    });
    const d = await r.json();
    setMsg({ ok: r.ok, text: r.ok ? "已解除绑定。" : d.error || "操作失败" });
    await load();
  }

  async function cancelInvite(id: string) {
    const r = await fetch(`/api/binding/invite/${id}`, { method: "DELETE" });
    const d = await r.json();
    setMsg({ ok: r.ok, text: r.ok ? "邀约已撤销。" : d.error || "操作失败" });
    await load();
  }

  if (!data) {
    return <div className="p-10 text-center text-black/40">正在加载绑定信息…</div>;
  }

  const isParent = data.role === "parent";
  const isStudent = data.role === "user";
  const boundParent = data.bound.parent ?? null;
  const boundChildren = data.bound.children ?? [];

  return (
    <div className="page-shell flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/me" className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground/60 hover:text-accent">
          <ArrowLeft size={16} weight="bold" /> 我的
        </Link>
        <h1 className="text-2xl font-black">账号绑定</h1>
      </div>

      {msg && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`}>
          {msg.text}
        </div>
      )}

      {/* 当前绑定状态 */}
      <section className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)]">
        <div className="flex items-center gap-2 text-sm font-bold text-accent"><CheckCircle size={18} weight="bold" /> 当前绑定</div>
        {isStudent && (
          <div className="mt-4">
            {boundParent ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-black/[0.035] p-4">
                <span>已绑定家长：<strong>{boundParent.username}</strong></span>
                <button onClick={() => unbind()} className="shrink-0 rounded-xl border border-black/9 px-3 py-1.5 text-sm font-bold text-foreground/60 hover:border-red-200 hover:text-red-600">解绑</button>
              </div>
            ) : (
              <p className="text-sm text-black/45">还没有绑定家长。可以注册一个家长账号，或让家长先注册后互相邀约绑定。</p>
            )}
          </div>
        )}
        {isParent && (
          <div className="mt-4 flex flex-col gap-3">
            {boundChildren.length > 0 ? boundChildren.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/[0.035] p-4">
                <span>已绑定孩子：<strong>{c.username}</strong></span>
                <button onClick={() => unbind(c.id)} className="shrink-0 rounded-xl border border-black/9 px-3 py-1.5 text-sm font-bold text-foreground/60 hover:border-red-200 hover:text-red-600">解绑</button>
              </div>
            )) : (
              <p className="text-sm text-black/45">还没有绑定孩子。在下方输入孩子的用户名发出邀约。</p>
            )}
          </div>
        )}
        {!isStudent && !isParent && (
          <p className="mt-4 text-sm text-black/45">管理员请在「管理」后台进行家长与孩子的绑定/解绑。</p>
        )}
      </section>

      {/* 双向邀约 */}
      {(isStudent || isParent) && (isParent || !boundParent) && (
        <section className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)]">
          <div className="flex items-center gap-2 text-sm font-bold text-accent"><LinkIcon size={18} weight="bold" /> 邀约绑定</div>
          <p className="mt-2 text-sm leading-6 text-black/45">
            {isParent
              ? "输入孩子的用户名发出邀约；孩子也在此页输入你的用户名后，双方匹配即完成绑定。"
              : "输入家长的用户名发出邀约；家长也在此页输入你的用户名后，双方匹配即完成绑定。"}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder={isParent ? "孩子的用户名" : "家长的用户名"}
              className="min-h-12 flex-1 rounded-2xl border border-black/9 bg-white px-4 outline-none focus:border-accent/50"
            />
            <button
              onClick={sendInvite}
              disabled={busy || !inviteName.trim()}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-foreground px-6 font-black text-white transition hover:-translate-y-0.5 disabled:opacity-40"
            >
              发出邀约
            </button>
          </div>

          {data.incoming.length > 0 && (
            <div className="mt-4 rounded-2xl bg-accent/8 p-4 text-sm leading-6">
              <strong>对方已向你发出邀约：</strong>
              {data.incoming.map((i) => (
                <div key={i.id} className="mt-1">· {i.username} —— 在上方输入 TA 的用户名即可立即完成绑定。</div>
              ))}
            </div>
          )}
          {data.outgoing.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {data.outgoing.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-4 rounded-2xl bg-black/[0.035] px-4 py-3 text-sm">
                  <span>已向 <strong>{i.username}</strong> 发出邀约，等待对方操作</span>
                  <button onClick={() => cancelInvite(i.id)} className="shrink-0 text-sm font-bold text-foreground/50 hover:text-red-600">撤销</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 学生自助注册家长 */}
      {isStudent && !boundParent && (
        <section className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)]">
          <div className="flex items-center gap-2 text-sm font-bold text-accent"><UserCirclePlus size={18} weight="bold" /> 注册家长账号</div>
          <p className="mt-2 text-sm leading-6 text-black/45">家长还没有账号？在这里直接注册一个，注册成功后自动与你绑定。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="家长用户名（至少2位）"
              className="min-h-12 rounded-2xl border border-black/9 bg-white px-4 outline-none focus:border-accent/50"
            />
            <input
              type="password"
              value={parentPwd}
              onChange={(e) => setParentPwd(e.target.value)}
              placeholder="家长密码（至少4位）"
              className="min-h-12 rounded-2xl border border-black/9 bg-white px-4 outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={registerParent}
            disabled={busy || parentName.trim().length < 2 || parentPwd.length < 4}
            className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-foreground px-6 font-black text-white transition hover:-translate-y-0.5 disabled:opacity-40"
          >
            注册并绑定
          </button>
        </section>
      )}

      <div className="flex items-center gap-2 text-sm text-black/35">
        <Users size={16} /> 绑定后，家长可以在「孩子」页查看学习情况，但不能参与学习。
      </div>
    </div>
  );
}
