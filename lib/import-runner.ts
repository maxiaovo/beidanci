// 导入后台任务：DeepSeek 分析 → 入库 → MiMo TTS 音频
import { prisma } from "./db";
import { analyzeUnitText } from "./deepseek";
import { synthesize } from "./mimo-tts";
import type { RawUnit } from "./parsers";

// 简单的进程内任务登记，防止同一本书重复跑
const running = new Set<string>();

export async function runImport(bookId: string, units: RawUnit[]) {
  if (running.has(bookId)) return;
  running.add(bookId);
  try {
    await prisma.book.update({
      where: { id: bookId },
      data: { status: "processing", analyzeTotal: units.length, analyzeDone: 0 },
    });

    // 1) 逐单元分析并入库
    for (let ui = 0; ui < units.length; ui++) {
      const raw = units[ui];
      let words;
      try {
        words = await analyzeUnitText(raw.text);
      } catch (e) {
        console.error(`单元「${raw.title}」分析失败:`, e);
        // 跳过失败单元，不拖垮整本书；进度照样推进
        await prisma.book.update({ where: { id: bookId }, data: { analyzeDone: ui + 1 } });
        continue;
      }
      const unit = await prisma.unit.create({
        data: { bookId, title: raw.title, orderIndex: ui },
      });
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        await prisma.word.create({
          data: {
            unitId: unit.id,
            orderIndex: wi,
            text: w.text,
            phonetic: w.phonetic,
            pos: w.pos,
            meaningCn: w.meaningCn,
            meaningEn: w.meaningEn,
            segments: JSON.stringify(w.segments),
            mnemonic: w.mnemonic,
            example1: w.example1,
            example1Cn: w.example1Cn,
            example2: w.example2,
            example2Cn: w.example2Cn,
          },
        });
      }
      await prisma.book.update({ where: { id: bookId }, data: { analyzeDone: ui + 1 } });
    }

    // 2) 批量生成音频
    const allWords = await prisma.word.findMany({
      where: { unit: { bookId } },
      orderBy: [{ unit: { orderIndex: "asc" } }, { orderIndex: "asc" }],
    });
    await prisma.book.update({
      where: { id: bookId },
      data: { audioTotal: allWords.length * 3, audioDone: 0 },
    });

    let done = 0;
    for (const w of allWords) {
      const audioWord = await synthesize(w.text, `${w.id}_word.wav`);
      done++;
      const audioEx1 = await synthesize(w.example1, `${w.id}_ex1.wav`);
      done++;
      const audioEx2 = await synthesize(w.example2, `${w.id}_ex2.wav`);
      done++;
      await prisma.word.update({
        where: { id: w.id },
        data: { audioWord, audioEx1, audioEx2 },
      });
      await prisma.book.update({ where: { id: bookId }, data: { audioDone: done } });
    }

    await prisma.book.update({ where: { id: bookId }, data: { status: "ready" } });
  } catch (e) {
    console.error("导入任务失败:", e);
    await prisma.book.update({ where: { id: bookId }, data: { status: "error" } });
  } finally {
    running.delete(bookId);
  }
}

// 补生成缺失音频（可后续手动触发）
export async function backfillAudio(bookId: string) {
  const words = await prisma.word.findMany({
    where: { unit: { bookId }, OR: [{ audioWord: null }, { audioEx1: null }, { audioEx2: null }] },
  });
  for (const w of words) {
    const audioWord = w.audioWord ?? (await synthesize(w.text, `${w.id}_word.wav`));
    const audioEx1 = w.audioEx1 ?? (await synthesize(w.example1, `${w.id}_ex1.wav`));
    const audioEx2 = w.audioEx2 ?? (await synthesize(w.example2, `${w.id}_ex2.wav`));
    await prisma.word.update({ where: { id: w.id }, data: { audioWord, audioEx1, audioEx2 } });
  }
}
