// 词书资产打包：把整本书的单词发音 + 例句朗读打成 zip，附一份 words.csv 索引
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { prisma } from "./db";
import { AUDIO_DIR } from "./mimo-tts";

export const PACKAGE_DIR = path.join(process.cwd(), "data", "packages");

export function packagePath(bookId: string): string {
  return path.join(PACKAGE_DIR, `${bookId}.zip`);
}

export function packageInfo(bookId: string): { exists: boolean; sizeBytes: number; updatedAt: number | null } {
  const p = packagePath(bookId);
  if (!fs.existsSync(p)) return { exists: false, sizeBytes: 0, updatedAt: null };
  const st = fs.statSync(p);
  return { exists: true, sizeBytes: st.size, updatedAt: st.mtimeMs };
}

export function deletePackage(bookId: string): boolean {
  const p = packagePath(bookId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 重新生成打包文件，返回 zip 路径
export async function buildPackage(bookId: string): Promise<string> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      units: {
        orderBy: { orderIndex: "asc" },
        include: { words: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });
  if (!book) throw new Error("词书不存在");

  fs.mkdirSync(PACKAGE_DIR, { recursive: true });

  // 收集音频文件 + 生成 CSV 索引
  const audioFiles: string[] = [];
  const rows: string[] = ["unit,word,phonetic,pos,meaning_cn,example1,example1_cn,example2,example2_cn,audio_word,audio_ex1,audio_ex2"];
  for (const u of book.units) {
    for (const w of u.words) {
      const files = [w.audioWord, w.audioEx1, w.audioEx2];
      for (const f of files) {
        if (f && fs.existsSync(path.join(AUDIO_DIR, f)) && !audioFiles.includes(f)) {
          audioFiles.push(f);
        }
      }
      rows.push(
        [
          csvEscape(u.title),
          csvEscape(w.text),
          csvEscape(w.phonetic),
          csvEscape(w.pos),
          csvEscape(w.meaningCn),
          csvEscape(w.example1),
          csvEscape(w.example1Cn),
          csvEscape(w.example2),
          csvEscape(w.example2Cn),
          w.audioWord ?? "",
          w.audioEx1 ?? "",
          w.audioEx2 ?? "",
        ].join(",")
      );
    }
  }
  if (audioFiles.length === 0) throw new Error("该词书还没有音频资产");

  // 临时目录组织打包内容（避免 zip -j 同名冲突，保留 csv 与 audio/ 子目录结构）
  const staging = path.join(PACKAGE_DIR, `.staging_${bookId}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, "audio"), { recursive: true });
  fs.writeFileSync(path.join(staging, "words.csv"), "﻿" + rows.join("\n"), "utf8");
  for (const f of audioFiles) {
    fs.copyFileSync(path.join(AUDIO_DIR, f), path.join(staging, "audio", f));
  }

  const zipPath = packagePath(bookId);
  fs.rmSync(zipPath, { force: true });

  await new Promise<void>((resolve, reject) => {
    execFile("zip", ["-r", "-q", zipPath, "."], { cwd: staging }, (err) => {
      fs.rmSync(staging, { recursive: true, force: true });
      if (err) reject(new Error(`打包失败: ${err.message}`));
      else resolve();
    });
  });
  return zipPath;
}
