"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface BookInfo {
  id: string;
  name: string;
  status: string;
  total: number;
  learned: number;
  mastered: number;
  units: number;
}

const COVERS = ["#A8D8EA", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#C7CEEA", "#FFD6E0"];

export default function WordsIndex() {
  const [books, setBooks] = useState<BookInfo[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/books").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      const d = await r.json();
      setBooks(d.books);
    });
  }, [router]);

  if (!books) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="font-bold text-2xl mb-6">单词书</h1>
      {books.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-10 text-center text-black/40">
          还没有单词书，<Link href="/import" className="text-blue-500 underline">去导入</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {books.map((b, i) => (
            <Link
              key={b.id}
              href={`/words/${b.id}`}
              className="rounded-2xl p-5 shadow hover:shadow-md transition-shadow"
              style={{ background: COVERS[i % COVERS.length] }}
            >
              <div className="font-bold text-lg leading-snug">{b.name}</div>
              <div className="text-sm text-black/50 mt-1">{b.units} 个单元 · {b.total} 词</div>
              <div className="text-xs text-black/50 mt-3">已学 {b.learned} · 掌握 {b.mastered}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
