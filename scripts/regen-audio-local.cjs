#!/usr/bin/env node
// 用本地 Qwen3-TTS 批量重新生成全部单词音频（覆盖式替换 MiMo 生成的旧音频）
// 用法:
//   node scripts/regen-audio-local.mjs --in words.json --out data/audio-qwen [--force]
//     --in    词表 JSON：[{id, text, example1, example2}, ...]（从生产库导出）
//     --out   输出目录，文件名与线上一致：<id>_word.wav / <id>_ex1.wav / <id>_ex2.wav
//     --force 重新生成已存在的文件（默认跳过，支持断点续跑）
// 生成完成后 rsync 到服务器:data/audio/ 即完成替换。
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const IN = arg("in", "");
const OUT = arg("out", "");
const BASE = arg("base", "http://localhost:8765");
const VOICE = arg("voice", "matthew-full");
const FORCE = args.includes("--force");

if (!IN || !OUT) {
  console.error("用法: node scripts/regen-audio-local.mjs --in words.json --out <目录> [--force]");
  process.exit(1);
}
const words = JSON.parse(fs.readFileSync(IN, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const tasks = [];
for (const w of words) {
  if (w.text?.trim()) tasks.push({ text: w.text, file: `${w.id}_word.wav` });
  if (w.example1?.trim()) tasks.push({ text: w.example1, file: `${w.id}_ex1.wav` });
  if (w.example2?.trim()) tasks.push({ text: w.example2, file: `${w.id}_ex2.wav` });
}

async function gen(text) {
  const res = await fetch(`${BASE}/api/v1/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "clone",
      voice: VOICE,
      text,
      language: "English",
      temperature: 0,
      max_tokens: 2048,
      return_format: "wav",
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error(`音频过短 ${buf.length}B`);
  return buf;
}

(async () => {
  let done = 0, skipped = 0;
  const failed = [];
  const t0 = Date.now();
  for (const t of tasks) {
    const out = path.join(OUT, t.file);
    if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 100) {
      skipped++; done++;
      continue;
    }
    try {
      fs.writeFileSync(out, await gen(t.text));
    } catch (e) {
      failed.push({ ...t, err: String(e).slice(0, 200) });
      console.error(`✗ ${t.file} (${t.text.slice(0, 40)}): ${e}`);
    }
    done++;
    if (done % 20 === 0 || done === tasks.length) {
      const el = (Date.now() - t0) / 1000;
      console.log(`进度 ${done}/${tasks.length}（跳过 ${skipped}，失败 ${failed.length}）已用 ${(el / 60).toFixed(1)} 分钟`);
    }
  }
  // 失败的重试一次
  for (let i = failed.length - 1; i >= 0; i--) {
    const t = failed[i];
    try {
      fs.writeFileSync(path.join(OUT, t.file), await gen(t.text));
      failed.splice(i, 1);
      console.log(`✓ 重试成功 ${t.file}`);
    } catch {}
  }
  console.log(`完成：共 ${tasks.length} 条，成功 ${tasks.length - failed.length}，失败 ${failed.length}`);
  if (failed.length) {
    fs.writeFileSync(path.join(OUT, "_failed.json"), JSON.stringify(failed, null, 2));
    process.exit(1);
  }
})();
