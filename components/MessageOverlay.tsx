"use client";

export interface ParentMessage {
  id: string;
  text: string;
  trigger: string; // start | minutes | word
  triggerValue: number | null;
}

// 家长留言居中弹窗：多条排队，一次显示一条，点"知道了"关闭并推进下一条
export default function MessageOverlay({
  queue,
  onClose,
}: {
  queue: ParentMessage[];
  onClose: (id: string) => void;
}) {
  const msg = queue[0];
  if (!msg) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center flex flex-col items-center gap-5">
        <div className="text-4xl">💌</div>
        <div className="text-black/40 text-sm font-bold">
          家长留言{queue.length > 1 ? ` · 还有 ${queue.length - 1} 条` : ""}
        </div>
        <div className="text-lg leading-relaxed whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
          {msg.text}
        </div>
        <button
          onClick={() => onClose(msg.id)}
          className="bg-foreground text-white rounded-xl px-10 py-3 font-bold hover:opacity-90 cursor-pointer"
        >
          知道了
        </button>
      </div>
    </div>
  );
}
