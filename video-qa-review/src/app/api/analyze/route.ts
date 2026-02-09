import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { segmentIntoScenes, applyGeminiTranscription } from "@/lib/videoIntelligence";
import { parseVIJson } from "@/lib/parseVIJson";
import { analyzeSceneWithGemini, uploadVideoToGemini, transcribeWithGemini } from "@/lib/gemini";
import type { ProjectConfig } from "@/types/project";
import type { Issue, IssueCategory, IssueSeverity } from "@/types/issue";
import { generateId, TARGET_AUDIENCE_LABELS } from "@/lib/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: unknown) {
        const payload = JSON.stringify({ type, data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      function sendLog(level: "info" | "warn" | "error" | "success", message: string, detail?: unknown) {
        sendEvent("log", {
          level,
          message,
          detail: detail ?? null,
          timestamp: new Date().toISOString(),
        });
      }

      function sendStatus(status: string) {
        sendEvent("status", { status });
      }

      try {
        // Parse form data
        const formData = await request.formData();
        const configStr = formData.get("config") as string | null;
        const durationStr = formData.get("duration") as string | null;
        const useMock = formData.get("mock") === "true";

        if (!configStr) {
          sendEvent("error", { message: "設定が不足しています" });
          controller.close();
          return;
        }

        const config: ProjectConfig = JSON.parse(configStr);
        const videoDuration = parseFloat(durationStr || "0");

        sendLog("info", "設定を読み込みました", {
          targetAudience: TARGET_AUDIENCE_LABELS[config.targetAudience] || config.targetAudience,
          videoPurpose: config.videoPurpose,
          language: config.language,
          additionalRules: config.additionalRules || "(なし)",
          mode: useMock ? "モック（サンプルJSON使用）" : "ライブ（API呼び出し）",
        });

        let viResult;
        let videoBuffer: Buffer | null = null;

        if (useMock) {
          // ===== MOCK MODE: Use pre-existing VI JSON =====
          sendStatus("analyzing_vi");
          sendLog("info", "モックモード: サンプルJSONからVI結果を読み込み中...");

          const jsonPath = join(process.cwd(), "public", "sample", "test_json.json");
          const rawJson = JSON.parse(readFileSync(jsonPath, "utf8"));
          viResult = parseVIJson(rawJson);

          // モックモードでもGemini動画解析のためにサンプル動画を読み込む
          const videoPath = join(process.cwd(), "public", "sample", "test_video.mp4");
          try {
            videoBuffer = readFileSync(videoPath);
            sendLog("info", `サンプル動画読み込み完了 (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`);
          } catch {
            sendLog("warn", "サンプル動画が見つかりません。Gemini動画解析はスキップされます。");
          }

          sendLog("success", "サンプルJSON読み込み完了");
        } else {
          // ===== LIVE MODE: Call actual VI API =====
          if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            sendLog("error", "GOOGLE_APPLICATION_CREDENTIALS が未設定です。.env.local を確認してください。");
            sendEvent("error", { message: "GOOGLE_APPLICATION_CREDENTIALS が未設定です。\nモックモードを使うか、GCPサービスアカウントキーを設定してください。" });
            controller.close();
            return;
          }
          sendLog("success", "API認証情報を確認しました");

          const videoFile = formData.get("video") as File | null;
          if (!videoFile) {
            sendEvent("error", { message: "動画ファイルが不足しています" });
            controller.close();
            return;
          }

          sendStatus("uploading");
          sendLog("info", `動画ファイル読み込み中: ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(1)} MB)`);
          videoBuffer = Buffer.from(await videoFile.arrayBuffer());
          sendLog("success", "動画ファイル読み込み完了");

          sendStatus("analyzing_vi");
          sendLog("info", "Video Intelligence API 呼び出し開始");

          const { analyzeVideo } = await import("@/lib/videoIntelligence");
          viResult = await analyzeVideo(videoBuffer);
        }

        // Log VI results
        sendLog("info", `ショット境界: ${viResult.shotChanges.length}件`, viResult.shotChanges.slice(0, 20));
        sendLog("info", `テキスト検出: ${viResult.textAnnotations.length}件`,
          viResult.textAnnotations.slice(0, 10).map((t) => t.text));
        sendLog("info", `音声文字起こし: ${viResult.speechTranscriptions.length}セグメント`);
        sendLog("info", `ラベル検出: ${viResult.labels.length}件`,
          viResult.labels.slice(0, 15).map((l) => l.description));
        sendLog("info", `不適切コンテンツフレーム: ${viResult.explicitFrames.length}件`);

        // Step 3: Scene segmentation
        sendStatus("segmenting");
        sendLog("info", "シーン分割を開始");
        const effectiveDuration = videoDuration || 252.669; // fallback to test video duration
        const scenes = segmentIntoScenes(viResult, effectiveDuration);
        sendLog("success", `${scenes.length}シーンに分割完了`);

        for (const scene of scenes) {
          sendLog("info", `  シーン${scene.index + 1}: ${scene.startTimeSeconds.toFixed(1)}s ~ ${scene.endTimeSeconds.toFixed(1)}s (${scene.durationSeconds.toFixed(1)}s)`, {
            texts: scene.viData.detectedText.length,
            speechWords: scene.viData.speechTranscription.length,
            labels: scene.viData.labels.length,
          });
        }

        // Step 4: Gemini analysis
        sendStatus("analyzing_gemini");

        const hasGeminiKey = !!process.env.GEMINI_API_KEY;
        const allIssues: Issue[] = [];

        if (hasGeminiKey) {
          // Geminiに動画をアップロード（1回だけ）
          let videoFileUri: string | undefined;
          if (videoBuffer) {
            sendLog("info", "Gemini Files API に動画をアップロード中...");
            try {
              videoFileUri = await uploadVideoToGemini(videoBuffer);
              sendLog("success", "Gemini動画アップロード完了");
            } catch (err) {
              const msg = err instanceof Error ? err.message : "不明なエラー";
              sendLog("warn", `Gemini動画アップロード失敗: ${msg}（テキストのみで解析を続行）`);
            }
          }

          // Gemini音声文字起こし（動画URIがある場合のみ）
          if (videoFileUri) {
            sendLog("info", "Gemini API で音声文字起こし開始...");
            try {
              const transcription = await transcribeWithGemini(videoFileUri);
              applyGeminiTranscription(scenes, transcription);
              sendLog("success", `Gemini音声文字起こし完了: ${transcription.words.length}ワード`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : "不明なエラー";
              sendLog("warn", `Gemini音声文字起こし失敗: ${msg}（VI API音声をフォールバック使用）`);
            }
          }

          sendLog("info", `Gemini API による ${scenes.length} シーンの分析開始${videoFileUri ? "（動画付き）" : "（テキストのみ）"}`);

          for (const scene of scenes) {
            const startGemini = Date.now();
            sendLog("info", `シーン ${scene.index + 1}/${scenes.length} を分析中...`);

            const result = await analyzeSceneWithGemini(scene, scenes.length, config, videoFileUri);
            const geminiDuration = Date.now() - startGemini;

            scene.geminiAnalysis = {
              summary: result.summary,
              issues: result.issues.map((issue) => ({
                id: generateId(),
                category: issue.category,
                severity: issue.severity,
                description: issue.description,
                suggestion: issue.suggestion,
                timestamp: issue.timestamp,
              })),
              overallRisk: result.overallRisk,
              detectedTextSummary: result.detectedTextSummary || undefined,
              speechSummary: result.speechSummary || undefined,
            };

            for (const issue of result.issues) {
              allIssues.push({
                id: generateId(),
                sceneIndex: scene.index,
                timestampSeconds: issue.timestamp,
                category: issue.category as IssueCategory,
                severity: issue.severity as IssueSeverity,
                title: `${issue.category}: ${issue.description.slice(0, 30)}`,
                description: issue.description,
                suggestion: issue.suggestion,
                status: "open",
              });
            }

            sendLog(
              result.issues.length > 0 ? "warn" : "success",
              `シーン ${scene.index + 1} 完了 (${geminiDuration}ms): リスク=${result.overallRisk}, 問題=${result.issues.length}件`,
              { summary: result.summary, issues: result.issues }
            );
          }
        } else {
          sendLog("warn", "GEMINI_API_KEY が未設定のため、Gemini解析をスキップします");
          sendLog("info", "VI結果のみでシーンデータを返します（問題検出なし）");
        }

        // Final result
        sendLog("success", `解析完了: 合計 ${allIssues.length} 件の問題を検出`);
        sendLog("info", `  重大: ${allIssues.filter((i) => i.severity === "critical").length}件`);
        sendLog("info", `  警告: ${allIssues.filter((i) => i.severity === "warning").length}件`);
        sendLog("info", `  情報: ${allIssues.filter((i) => i.severity === "info").length}件`);

        sendEvent("result", { scenes, issues: allIssues });
      } catch (err) {
        const message = err instanceof Error ? err.message : "不明なエラー";
        sendLog("error", `エラーが発生しました: ${message}`);
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
