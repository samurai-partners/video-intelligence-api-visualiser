import { NextRequest } from "next/server";
import { segmentIntoScenes } from "@/lib/videoIntelligence";
import { parseVIJson } from "@/lib/parseVIJson";
import { uploadVideoToGemini, transcribeChunkWithGemini, createTimeChunks } from "@/lib/gemini";
import type { ChunkSceneInput } from "@/lib/gemini";
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

        // Step 2: Gemini transcription (per-scene)
        if (videoFile && process.env.GEMINI_API_KEY) {
          try {
            // Upload video to Gemini (once)
            sendStatus("importing_upload");
            sendLog("info", "Gemini Files API に動画をアップロード中...");
            const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
            const videoFileUri = await uploadVideoToGemini(videoBuffer);
            sendLog("success", "動画アップロード完了");

            // Chunk-based transcription (group scenes into ~60s chunks)
            sendStatus("importing_transcribe");
            const CONCURRENCY = 5;

            const chunkInputs: ChunkSceneInput[] = scenes.map((s) => ({
              sceneIndex: s.index,
              startTimeSeconds: s.startTimeSeconds,
              endTimeSeconds: s.endTimeSeconds,
            }));
            const chunks = createTimeChunks(chunkInputs);

            sendLog("info", `Gemini文字起こし開始: ${scenes.length}シーン → ${chunks.length}チャンク (${CONCURRENCY}並列)`);
            let completedScenes = 0;

            async function processChunk(chunk: ChunkSceneInput[], chunkIndex: number) {
              const chunkStart = chunk[0].startTimeSeconds.toFixed(1);
              const chunkEnd = chunk[chunk.length - 1].endTimeSeconds.toFixed(1);
              const label = `チャンク${chunkIndex + 1} (${chunkStart}s〜${chunkEnd}s, ${chunk.length}シーン)`;

              try {
                const result = await transcribeChunkWithGemini(videoFileUri, chunk, "ja");

                // Apply results to scenes and send events
                for (const sceneResult of result.scenes) {
                  const scene = scenes.find((s) => s.index === sceneResult.sceneIndex);
                  if (!scene) continue;

                  if (sceneResult.words.length > 0) {
                    scene.geminiTranscription = {
                      words: sceneResult.words.map((w) => ({
                        word: w.word,
                        startTimeSeconds: w.startSeconds,
                        endTimeSeconds: w.endSeconds,
                        confidence: 1.0,
                        source: "gemini" as const,
                      })),
                      fullTranscript: sceneResult.fullTranscript,
                      detectedLanguage: sceneResult.detectedLanguage,
                      translatedTranscript: sceneResult.translatedTranscript,
                      translatedWords: sceneResult.translatedWords.map((w) => ({
                        word: w.word,
                        startTimeSeconds: w.startSeconds,
                        endTimeSeconds: w.endSeconds,
                        confidence: 1.0,
                        source: "gemini" as const,
                      })),
                    };
                  }

                  completedScenes++;
                  sendEvent("transcription_scene", {
                    sceneIndex: scene.index,
                    geminiTranscription: scene.geminiTranscription || null,
                    completedScenes,
                    totalScenes: scenes.length,
                  });
                }

                const wordsInChunk = result.scenes.reduce((sum, s) => sum + s.words.length, 0);
                sendLog("info", `${label}: ${wordsInChunk}ワード (${completedScenes}/${scenes.length})`);
              } catch (err) {
                const msg = err instanceof Error ? err.message : "不明なエラー";
                if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
                  sendLog("warn", `${label}: レート制限 — 5秒待機してリトライ`);
                  await new Promise((r) => setTimeout(r, 5000));
                  try {
                    const retry = await transcribeChunkWithGemini(videoFileUri, chunk, "ja");
                    for (const sceneResult of retry.scenes) {
                      const scene = scenes.find((s) => s.index === sceneResult.sceneIndex);
                      if (!scene) continue;

                      if (sceneResult.words.length > 0) {
                        scene.geminiTranscription = {
                          words: sceneResult.words.map((w) => ({
                            word: w.word,
                            startTimeSeconds: w.startSeconds,
                            endTimeSeconds: w.endSeconds,
                            confidence: 1.0,
                            source: "gemini" as const,
                          })),
                          fullTranscript: sceneResult.fullTranscript,
                          detectedLanguage: sceneResult.detectedLanguage,
                          translatedTranscript: sceneResult.translatedTranscript,
                          translatedWords: sceneResult.translatedWords.map((w) => ({
                            word: w.word,
                            startTimeSeconds: w.startSeconds,
                            endTimeSeconds: w.endSeconds,
                            confidence: 1.0,
                            source: "gemini" as const,
                          })),
                        };
                      }

                      completedScenes++;
                      sendEvent("transcription_scene", {
                        sceneIndex: scene.index,
                        geminiTranscription: scene.geminiTranscription || null,
                        completedScenes,
                        totalScenes: scenes.length,
                      });
                    }
                  } catch {
                    // Mark all scenes in this chunk as failed
                    for (const input of chunk) {
                      completedScenes++;
                      sendEvent("transcription_scene", {
                        sceneIndex: input.sceneIndex,
                        geminiTranscription: null,
                        completedScenes,
                        totalScenes: scenes.length,
                      });
                    }
                    sendLog("error", `${label}: リトライ失敗`);
                  }
                } else {
                  // Mark all scenes in this chunk as failed
                  for (const input of chunk) {
                    completedScenes++;
                    sendEvent("transcription_scene", {
                      sceneIndex: input.sceneIndex,
                      geminiTranscription: null,
                      completedScenes,
                      totalScenes: scenes.length,
                    });
                  }
                  sendLog("error", `${label}: ${msg}`);
                }
              }
            }

            // Parallel window: up to CONCURRENCY chunks at once
            const pending = new Set<Promise<void>>();
            for (let i = 0; i < chunks.length; i++) {
              const p = processChunk(chunks[i], i).then(() => { pending.delete(p); });
              pending.add(p);
              if (pending.size >= CONCURRENCY) {
                await Promise.race(pending);
              }
            }
            await Promise.all(pending);

            sendLog("success", `Gemini文字起こし完了: ${scenes.filter((s) => s.geminiTranscription).length}/${scenes.length}シーンに反映`);
          } catch (err) {
            // Upload failure — whole transcription skipped
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
