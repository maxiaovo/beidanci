// 文件文本提取 + 单元切分
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export async function extractText(fileName: string, buffer: Buffer): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === "xlsx" || ext === "xls") {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
      for (const row of rows) {
        const line = row.map((c) => String(c ?? "").trim()).filter(Boolean).join("\t");
        if (line) lines.push(line);
      }
    }
    return lines.join("\n");
  }
  if (ext === "csv" || ext === "txt") {
    // 兼容 UTF-8 BOM
    return buffer.toString("utf-8").replace(/^﻿/, "");
  }
  throw new Error(`不支持的文件格式: .${ext}（支持 docx / xlsx / txt / csv）`);
}

export interface RawUnit {
  title: string;
  text: string;
}

// 单元标题：第1周：… / 第1周 (Lesson 1)：… / Unit 1（第1周）：… / Lesson 3：…
const UNIT_TITLE_RE = /^(?:第\s*\d+\s*周|Unit\s*\d+|Lesson\s*\d+|第\s*\d+\s*(?:课|单元))/i;

export function splitIntoUnits(raw: string): RawUnit[] {
  const lines = raw.split(/\r?\n/);
  const units: RawUnit[] = [];
  let current: RawUnit | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // 跳过文件头部信息行（标题/统计/词汇来源）
    if (/^(词汇来源|共\s*\d+\s*课)/.test(line)) continue;
    if (UNIT_TITLE_RE.test(line) && line.length < 120) {
      current = { title: line, text: "" };
      units.push(current);
    } else if (current) {
      current.text += line + "\n";
    }
    // 标题出现前的行丢弃
  }

  const nonEmpty = units.filter((u) => u.text.trim());
  if (nonEmpty.length) return nonEmpty;
  // 无单元结构：整体作为一个默认单元
  return [{ title: "默认单元", text: raw.trim() }];
}
