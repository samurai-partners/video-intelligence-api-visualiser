import { NextRequest } from "next/server";
import { analyzeVideo, segmentIntoScenes } from "@/lib/videoIntelligence";
import { analyzeSceneWithGemini } from "@/lib/gemini";
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
        const videoFile = formData.get("video") as File | null;
        const configStr = formData.get("config") as string | null;
        const durationStr = formData.get("duration") as string | null;

        if (!videoFile || !configStr) {
          sendEvent("error", { message: "動画ファイルまたは設定が不足しています" });
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
        });

        // Check API credentials
        if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          sendLog("error", "GOOGLE_APPLICATION_CREDENTIALS が未設定です。.env.local を確認してください。");
          sendEvent("error", { message: "GOOGLE_APPLICATION_CREDENTIALS が未設定です。\nGCPサービスアカウントキーのパスを .env.local に設定してください。\n\n例: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json" });
          controller.close();
          return;
        }
        if (!process.env.GEMINI_API_KEY) {
          sendLog("error", "GEMINI_API_KEY が未設定です。.env.local を確認してください。");
          sendEvent("error", { message: "GEMINI_API_KEY が未設定です。\nhttps://aistudio.google.com/apikey からAPIキーを取得して .env.local に設定してください。\n\n例: GEMINI_API_KEY=AIza..." });
          controller.close();
          return;
        }
        sendLog("success", "API認証情報を確認しました");

        // Step 1: Read video file
        sendStatus("uploading");
        sendLog("info", `動画ファイル読み込み中: ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(1)} MB)`);
        const startUpload = Date.now();
        const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
        sendLog("success", `動画ファイル読み込み完了 (${Date.now() - startUpload}ms)`);

        // Step 2: Video Intelligence API
        sendStatus("analyzing_vi");
        sendLog("info", "Video Intelligence API 呼び出し開始（5つの機能）");
        sendLog("info", "  - SHOT_CHANGE_DETECTION（ショット検出）");
        sendLog("info", "  - TEXT_DETECTION（テキスト検出 / OCR）");
        sendLog("info", "  - SPEECH_TRANSCRIPTION（音声文字起こし）");
        sendLog("info", "  - EXPLICIT_CONTENT_DETECTION（不適切コンテンツ）");
        sendLog("info", "  - LABEL_DETECTION（ラベル検出）");

        const startVI = Date.now();
        const viResult = await analyzeVideo(videoBuffer);
        const viDuration = Date.now() - startVI;

        sendLog("success", `Video Intelligence API 完了 (${viDuration}ms)`);
        sendLog("info", `ショット境界: ${viResult.shotChanges.length}件`, viResult.shotChanges);
        sendLog("info", `テキスト検出: ${viResult.textAnnotations.length}件`,
          viResult.textAnnotations.map((t) => t.text));
        sendLog("info", `音声文字起こし: ${viResult.speechTranscriptions.length}セグメント`,
          viResult.speechTranscriptions.map((s) => s.transcript.slice(0, 50)));
        sendLog("info", `ラベル検出: ${viResult.labels.length}件`,
          viResult.labels.map((l) => l.description));
        sendLog("info", `不適切コンテンツフレーム: ${viResult.explicitFrames.length}件`);

        // Step 3: Scene segmentation
        sendStatus("segmenting");
        sendLog("info", "シーン分割を開始");
        const scenes = segmentIntoScenes(viResult, videoDuration);
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
        sendLog("info", `Gemini API による ${scenes.length} シーンの分析開始`);

        const allIssues: Issue[] = [];

        for (const scene of scenes) {
          const startGemini = Date.now();
          sendLog("info", `シーン ${scene.index + 1}/${scenes.length} を分析中...`);

          const result = await analyzeSceneWithGemini(scene, scenes.length, config);
          const geminiDuration = Date.now() - startGemini;

          // Attach gemini result to scene
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
          };

          // Collect flat issues
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
            {
              summary: result.summary,
              issues: result.issues,
            }
          );
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
