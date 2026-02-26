import { NextRequest } from "next/server";
import { segmentIntoScenes } from "@/lib/videoIntelligence";
import { parseVIJson } from "@/lib/parseVIJson";
import { transcribeChunkWithGemini, createTimeChunks } from "@/lib/gemini";
import type { ChunkSceneInput } from "@/lib/gemini";
import { splitVideoIntoChunks } from "@/lib/ffmpeg";
import type { Issue } from "@/types/issue";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: unknown) {
        const payload = JSON.stringify({ type, data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      function sendStatus(status: string) {
        sendEvent("status", { status });
      }

      function sendLog(level: "info" | "warn" | "error" | "success", message: string) {
        sendEvent("log", {
          level,
          message,
          detail: null,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        const formData = await request.formData();
        const jsonFile = formData.get("json") as File | null;
        const videoFile = formData.get("video") as File | null;
        const durationStr = formData.get("duration") as string | null;

        if (!jsonFile) {
          sendEvent("error", { message: "JSONファイルが不足しています" });
          controller.close();
          return;
        }

        // Step 1: Parse JSON + segment scenes
        sendStatus("importing_parse");
        sendLog("info", "JSONファイルをパース中...");

        const jsonText = await jsonFile.text();
        const rawJson = JSON.parse(jsonText);
        const viResult = parseVIJson(rawJson);
        const videoDuration = parseFloat(durationStr || "0") || 300;

        sendLog("info", `VI結果: ショット=${viResult.shotChanges.length}, 音声セグメント=${viResult.speechTranscriptions.length}, テキスト=${viResult.textAnnotations.length}`);
        const totalSpeechWords = viResult.speechTranscriptions.reduce((sum, st) => sum + st.words.length, 0);
        sendLog("info", `VI音声ワード合計: ${totalSpeechWords}`);

        const scenes = segmentIntoScenes(viResult, videoDuration);
        sendLog("success", `${scenes.length}シーンに分割完了`);

        const scenesWithSpeech = scenes.filter((s) => s.viData.speechTranscription.length > 0).length;
        sendLog("info", `音声ありシーン: ${scenesWithSpeech}/${scenes.length}`);

        // Send scenes immediately (VI data only) — frontend navigates here
        sendEvent("scenes_ready", { scenes, issues: [] as Issue[] });

        // Step 2: Gemini transcription (ffmpeg chunk-based)
        if (videoFile && process.env.GEMINI_API_KEY) {
          try {
            const videoBuffer = Buffer.from(await videoFile.arrayBuffer());

            // Group scenes into ~60s chunks
            const chunkInputs: ChunkSceneInput[] = scenes.map((s) => ({
              sceneIndex: s.index,
              startTimeSeconds: s.startTimeSeconds,
              endTimeSeconds: s.endTimeSeconds,
            }));
            const chunks = createTimeChunks(chunkInputs);

            // Log chunk details for debugging
            for (let ci = 0; ci < chunks.length; ci++) {
              const c = chunks[ci];
              const dur = (c[c.length - 1].endTimeSeconds - c[0].startTimeSeconds).toFixed(1);
              sendLog("info", `チャンク${ci + 1}: ${c[0].startTimeSeconds.toFixed(1)}s〜${c[c.length - 1].endTimeSeconds.toFixed(1)}s (${dur}s, ${c.length}シーン, scenes ${c[0].sceneIndex}〜${c[c.length - 1].sceneIndex})`);
            }

            // Cut video into chunks with ffmpeg
            sendStatus("importing_upload");
            sendLog("info", `ffmpegで動画を${chunks.length}チャンクに切り出し中...`);

            const CHUNK_OVERLAP_SECONDS = 5;
            const chunkRanges = chunks.map((chunk, i) => ({
              startSeconds: i === 0 ? chunk[0].startTimeSeconds : Math.max(0, chunk[0].startTimeSeconds - CHUNK_OVERLAP_SECONDS),
              endSeconds: chunk[chunk.length - 1].endTimeSeconds,
            }));
            const chunkBuffers = await splitVideoIntoChunks(videoBuffer, chunkRanges);
            sendLog("success", `動画切り出し完了: ${chunkBuffers.map((b) => `${(b.length / 1024 / 1024).toFixed(1)}MB`).join(", ")}`);

            // Transcribe chunks with limited concurrency
            sendStatus("importing_transcribe");
            const CONCURRENCY = 3;
            sendLog("info", `Gemini文字起こし開始: ${scenes.length}シーン → ${chunks.length}チャンク (${CONCURRENCY}並列)`);
            let completedScenes = 0;

            // wordプール: 全チャンクからwordを集め、後で一括でシーンに再割り当て
            interface WordPoolEntry {
              word: string;
              startSeconds: number;
              endSeconds: number;
              detectedLanguage: string;
            }
            interface TranslatedWordEntry {
              word: string;
              startSeconds: number;
              endSeconds: number;
            }
            const wordPool: WordPoolEntry[] = [];
            const translatedWordPool: TranslatedWordEntry[] = [];
            const detectedLanguages = new Map<string, number>();

            async function processChunk(chunk: ChunkSceneInput[], chunkIndex: number, chunkBuffer: Buffer) {
              const chunkOffset = chunkRanges[chunkIndex].startSeconds;
              const chunkStart = chunk[0].startTimeSeconds.toFixed(1);
              const chunkEnd = chunk[chunk.length - 1].endTimeSeconds.toFixed(1);
              const label = `チャンク${chunkIndex + 1} (${chunkStart}s〜${chunkEnd}s, ${chunk.length}シーン, ${(chunkBuffer.length / 1024 / 1024).toFixed(1)}MB)`;

              async function tryTranscribe() {
                return await transcribeChunkWithGemini(chunkBuffer, chunk, chunkOffset, "ja");
              }

              try {
                let result: Awaited<ReturnType<typeof tryTranscribe>> | undefined;
                try {
                  result = await tryTranscribe();
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "";
                  const isRateLimit = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
                  if (!isRateLimit) throw err;

                  // Retry with exponential backoff
                  const delays = [5000, 10000, 20000];
                  let success = false;
                  for (let attempt = 0; attempt < delays.length; attempt++) {
                    sendLog("warn", `${label}: レート制限 — ${delays[attempt] / 1000}秒待機してリトライ (${attempt + 1}/${delays.length})`);
                    await new Promise((r) => setTimeout(r, delays[attempt]));
                    try {
                      result = await tryTranscribe();
                      success = true;
                      break;
                    } catch { /* continue */ }
                  }
                  if (!success) throw err;
                }

                // Geminiのシーン割り当てを無視し、全wordをプールに追加
                let chunkWordCount = 0;
                for (const sceneResult of result!.scenes) {
                  const lang = sceneResult.detectedLanguage || "unknown";
                  detectedLanguages.set(lang, (detectedLanguages.get(lang) || 0) + sceneResult.words.length);
                  for (const w of sceneResult.words) {
                    wordPool.push({
                      word: w.word,
                      startSeconds: w.startSeconds,
                      endSeconds: w.endSeconds,
                      detectedLanguage: lang,
                    });
                    chunkWordCount++;
                  }
                  for (const w of sceneResult.translatedWords) {
                    translatedWordPool.push({
                      word: w.word,
                      startSeconds: w.startSeconds,
                      endSeconds: w.endSeconds,
                    });
                  }
                }

                sendLog("info", `${label}: ${chunkWordCount}ワード取得`);
              } catch (err) {
                const msg = err instanceof Error ? err.message : "不明なエラー";
                const sceneIds = chunk.map((c) => c.sceneIndex).join(", ");
                sendLog("error", `${label}: 失敗 (scenes: ${sceneIds}) — ${msg}`);
              }
            }

            // Parallel window: up to CONCURRENCY chunks at once
            const pending = new Set<Promise<void>>();
            for (let i = 0; i < chunks.length; i++) {
              const p = processChunk(chunks[i], i, chunkBuffers[i]).then(() => { pending.delete(p); });
              pending.add(p);
              if (pending.size >= CONCURRENCY) {
                await Promise.race(pending);
              }
            }
            await Promise.all(pending);

            // --- オーバーラップベースのword→シーン再割り当て ---
            // wordをタイムスタンプ順にソート
            wordPool.sort((a, b) => a.startSeconds - b.startSeconds);
            translatedWordPool.sort((a, b) => a.startSeconds - b.startSeconds);

            // 重複除去（オーバーラップチャンクから同じwordが2回来る可能性）
            function dedupeWords<T extends { word: string; startSeconds: number; endSeconds: number }>(pool: T[]): T[] {
              const result: T[] = [];
              for (const w of pool) {
                const last = result[result.length - 1];
                // 同じword文字列で開始時間が0.3秒以内 → 重複
                if (last && last.word === w.word && Math.abs(last.startSeconds - w.startSeconds) < 0.3) continue;
                result.push(w);
              }
              return result;
            }
            const dedupedWords = dedupeWords(wordPool);
            const dedupedTranslated = dedupeWords(translatedWordPool);

            // 各wordを「時間的に最も重なるシーン」に割り当て
            // wordの中心時間を計算し、そのシーンに割り当て（短いwordでも安定）
            function findBestScene(wStart: number, wEnd: number): number {
              const centerTime = (wStart + wEnd) / 2;
              let bestIdx = -1;
              let bestOverlap = -1;

              for (let i = 0; i < scenes.length; i++) {
                const s = scenes[i];
                // 中心時間がシーン内にある → 最優先
                if (centerTime >= s.startTimeSeconds && centerTime < s.endTimeSeconds) {
                  return i;
                }
                // フォールバック: オーバーラップ量で判定
                const overlap = Math.max(0, Math.min(wEnd, s.endTimeSeconds) - Math.max(wStart, s.startTimeSeconds));
                if (overlap > bestOverlap) {
                  bestOverlap = overlap;
                  bestIdx = i;
                }
              }
              return bestIdx;
            }

            // シーンごとのword配列を構築
            const sceneWords: Map<number, WordPoolEntry[]> = new Map();
            const sceneTranslatedWords: Map<number, TranslatedWordEntry[]> = new Map();

            for (const w of dedupedWords) {
              const idx = findBestScene(w.startSeconds, w.endSeconds);
              if (idx < 0) continue;
              if (!sceneWords.has(idx)) sceneWords.set(idx, []);
              sceneWords.get(idx)!.push(w);
            }
            for (const w of dedupedTranslated) {
              const idx = findBestScene(w.startSeconds, w.endSeconds);
              if (idx < 0) continue;
              if (!sceneTranslatedWords.has(idx)) sceneTranslatedWords.set(idx, []);
              sceneTranslatedWords.get(idx)!.push(w);
            }

            // 最頻出の検出言語
            const mainLanguage = [...detectedLanguages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

            // --- ハイブリッドアライメント: GeminiテキストにVI APIタイムスタンプをマッピング ---
            // 文字単位の累積位置でGemini wordをVI API wordのタイムスタンプに揃える
            function alignGeminiWithVI(
              geminiWords: WordPoolEntry[],
              viWords: Array<{ word: string; startTimeSeconds: number; endTimeSeconds: number }>,
            ): WordPoolEntry[] {
              if (viWords.length === 0) return geminiWords; // VI API音声なし→Geminiそのまま
              if (geminiWords.length === 0) return [];

              // VI APIのテキストを文字単位のタイムライン化
              // 各文字にVI APIのタイムスタンプを線形補間で割り当て
              const viCharTimestamps: Array<{ char: string; time: number }> = [];
              for (const vw of viWords) {
                const chars = [...vw.word];
                const duration = vw.endTimeSeconds - vw.startTimeSeconds;
                for (let ci = 0; ci < chars.length; ci++) {
                  viCharTimestamps.push({
                    char: chars[ci],
                    time: vw.startTimeSeconds + (duration * ci) / Math.max(chars.length, 1),
                  });
                }
              }
              if (viCharTimestamps.length === 0) return geminiWords;

              // Geminiの各wordに対して、文字の累積位置でVI APIのタイムスタンプをマッピング
              const geminiText = geminiWords.map((w) => w.word).join("");
              const viText = viCharTimestamps.map((c) => c.char).join("");

              // 文字列が大きく異なる（言語違いなど）→ アライメント不可、Geminiそのまま
              if (geminiText.length === 0 || viText.length === 0) return geminiWords;

              // 各Gemini wordに対してVI APIタイムラインから開始/終了時刻を取得
              const result: WordPoolEntry[] = [];
              let geminiCharPos = 0;

              for (const gw of geminiWords) {
                const wordLen = [...gw.word].length;
                // Geminiの文字位置をVI APIの文字位置に比例マッピング
                const viStartIdx = Math.round((geminiCharPos / Math.max(geminiText.length, 1)) * viCharTimestamps.length);
                const viEndIdx = Math.round(((geminiCharPos + wordLen) / Math.max(geminiText.length, 1)) * viCharTimestamps.length);

                const clampedStart = Math.min(Math.max(viStartIdx, 0), viCharTimestamps.length - 1);
                const clampedEnd = Math.min(Math.max(viEndIdx - 1, 0), viCharTimestamps.length - 1);

                result.push({
                  ...gw,
                  startSeconds: viCharTimestamps[clampedStart].time,
                  endSeconds: viCharTimestamps[clampedEnd].time + 0.1, // 最低0.1秒の幅
                });

                geminiCharPos += wordLen;
              }

              return result;
            }

            // シーンに割り当て & ハイブリッドアライメント適用 & イベント送信
            for (let i = 0; i < scenes.length; i++) {
              const scene = scenes[i];
              const geminiWordsRaw = sceneWords.get(i) || [];
              const translated = sceneTranslatedWords.get(i) || [];

              // VI APIのword（このシーンに割り当て済み）
              const viWordsForScene = scene.viData.speechTranscription || [];

              // ハイブリッド: GeminiテキストにVI APIタイムスタンプを適用
              const alignedWords = alignGeminiWithVI(geminiWordsRaw, viWordsForScene);

              if (alignedWords.length > 0) {
                scene.geminiTranscription = {
                  words: alignedWords.map((w) => ({
                    word: w.word,
                    startTimeSeconds: w.startSeconds,
                    endTimeSeconds: w.endSeconds,
                    confidence: 1.0,
                    source: "gemini" as const,
                  })),
                  fullTranscript: alignedWords.map((w) => w.word).join(""),
                  detectedLanguage: mainLanguage,
                  translatedTranscript: translated.map((w) => w.word).join(""),
                  translatedWords: translated.map((w) => ({
                    word: w.word,
                    startTimeSeconds: w.startSeconds,
                    endTimeSeconds: w.endSeconds,
                    confidence: 1.0,
                    source: "gemini" as const,
                  })),
                };
              }

              sendEvent("transcription_scene", {
                sceneIndex: scene.index,
                geminiTranscription: scene.geminiTranscription || null,
                completedScenes: i + 1,
                totalScenes: scenes.length,
              });
            }

            sendLog("success", `Gemini文字起こし完了: ${scenes.filter((s) => s.geminiTranscription).length}/${scenes.length}シーンに反映 (${dedupedWords.length}ワード, オーバーラップベース割り当て)`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : "不明なエラー";
            sendLog("error", `Gemini文字起こし失敗: ${msg}`);
          }
        } else {
          if (!videoFile) {
            sendLog("info", "動画ファイルなし — Gemini文字起こしスキップ");
          } else {
            sendLog("info", "GEMINI_API_KEY未設定 — Gemini文字起こしスキップ");
          }
        }

        // Send final result with Gemini transcription applied
        sendEvent("result", { scenes, issues: [] as Issue[] });
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラー";
        sendLog("error", `エラー: ${message}`);
        sendEvent("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
