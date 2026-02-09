"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/stores/useProjectStore";
import { VideoUploader } from "@/components/upload/VideoUploader";
import { AnalysisConfigForm } from "@/components/upload/AnalysisConfigForm";
import { generateId } from "@/lib/utils";
import Link from "next/link";
import type { Scene } from "@/types/scene";
import type { Issue } from "@/types/issue";

type ImportStep = "idle" | "importing_parse" | "importing_upload" | "importing_transcribe" | "done";

const IMPORT_STEP_LABELS: Record<ImportStep, string> = {
  idle: "テストデータで表示",
  importing_parse: "JSONパース中...",
  importing_upload: "Geminiにアップロード中...",
  importing_transcribe: "Gemini文字起こし中...",
  done: "完了",
};

/**
 * SSEリーダーをコンポーネント外で実行する。
 * router.push()後にコンポーネントがアンマウントされてもSSE読み取りを継続するため。
 */
function readImportSSEInBackground(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  const store = useProjectStore.getState();

  console.log("[BG-SSE] Background reader started");
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[BG-SSE] Stream ended (done=true)");
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const dataLine = line.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));
            console.log("[BG-SSE] Received event:", payload.type);

            if (payload.type === "transcription_scene") {
              const { sceneIndex, geminiTranscription, completedScenes, totalScenes } = payload.data;
              const store = useProjectStore.getState();
              if (geminiTranscription) {
                store.updateScenesTranscription([{
                  index: sceneIndex,
                  geminiTranscription,
                }]);
              }
              store.setTranscriptionProgress({ completed: completedScenes, total: totalScenes });
              console.log(`[BG-SSE] Scene ${sceneIndex + 1}: ${completedScenes}/${totalScenes}`);
            } else if (payload.type === "result") {
              const scenes = payload.data.scenes as Scene[];
              const geminiCount = scenes.filter((s) => s.geminiTranscription?.words?.length).length;
              console.log(`[BG-SSE] Result: ${scenes.length} scenes, ${geminiCount} with Gemini transcription`);
              useProjectStore.getState().setScenes(scenes);
              useProjectStore.getState().setTranscriptionProgress(null);
              useProjectStore.getState().setAnalysisStatus("completed");
            } else if (payload.type === "log") {
              console.log(`[BG-SSE] Log [${payload.data.level}]: ${payload.data.message}`);
            } else if (payload.type === "error") {
              console.error("[BG-SSE] Error:", payload.data.message);
              useProjectStore.getState().setTranscriptionProgress(null);
              useProjectStore.getState().setAnalysisStatus("completed");
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      // SSE connection closed — set completed if still importing
      const status = useProjectStore.getState().analysisStatus;
      if (status === "importing_transcribe" || status === "importing_upload") {
        useProjectStore.getState().setAnalysisStatus("completed");
      }
      console.warn("[BG-SSE] Background reader ended:", err);
    }
    // Ensure status is completed when stream ends normally
    const finalStatus = useProjectStore.getState().analysisStatus;
    if (finalStatus !== "completed") {
      console.log("[BG-SSE] Stream ended but status was", finalStatus, "→ setting completed");
      useProjectStore.getState().setAnalysisStatus("completed");
    }
  })();
}

export default function NewProjectPage() {
  const router = useRouter();
  const draftVideo = useProjectStore((s) => s.draftVideo);

  const canStart = !!draftVideo;

  const handleStart = () => {
    if (!canStart) return;
    const projectId = generateId();
    router.push(`/projects/${projectId}`);
  };

  // Test data import
  const [testVideo, setTestVideo] = useState<File | null>(null);
  const [testJson, setTestJson] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<ImportStep>("idle");
  const videoInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleImportTest = async () => {
    if (!testVideo || !testJson) return;
    setImportStep("importing_parse");

    try {
      // Get video duration
      const videoUrl = URL.createObjectURL(testVideo);
      const duration = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          resolve(v.duration);
          URL.revokeObjectURL(v.src);
        };
        v.onerror = () => {
          resolve(300);
          URL.revokeObjectURL(v.src);
        };
        v.src = videoUrl;
      });

      // Set video in store
      const storeVideoUrl = URL.createObjectURL(testVideo);
      const store = useProjectStore.getState();
      store.setDraftVideo({
        file: testVideo,
        url: storeVideoUrl,
        name: testVideo.name,
        duration,
        size: testVideo.size,
      });
      store.setVideoFile(testVideo);

      // Send JSON + video to server via SSE
      const formData = new FormData();
      formData.append("json", testJson);
      formData.append("video", testVideo);
      formData.append("duration", String(duration));

      const response = await fetch("/api/import-json", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read SSE stream — wait for scenes_ready, then hand off to background
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      const projectId = generateId();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        let shouldBreak = false;
        for (const line of lines) {
          const dataLine = line.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));

            if (payload.type === "status") {
              const status = payload.data.status as ImportStep;
              if (status in IMPORT_STEP_LABELS) {
                setImportStep(status);
              }
            } else if (payload.type === "scenes_ready") {
              // VI data ready — set store, hand off reader, navigate
              const scenes = payload.data.scenes as Scene[];
              const issues = payload.data.issues as Issue[];
              store.setScenes(scenes);
              store.setIssues(issues);
              store.setAnalysisStatus("importing_transcribe");

              // Hand off remaining SSE to background reader (survives navigation)
              readImportSSEInBackground(reader);
              router.push(`/projects/${projectId}`);
              shouldBreak = true;
              break;
            } else if (payload.type === "result") {
              // No Gemini — got result directly
              const scenes = payload.data.scenes as Scene[];
              store.setScenes(scenes);
              store.setAnalysisStatus("completed");
              router.push(`/projects/${projectId}`);
              shouldBreak = true;
              break;
            } else if (payload.type === "error") {
              throw new Error(payload.data.message);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
        if (shouldBreak) break;
      }
    } catch (err) {
      alert(`インポート失敗: ${err instanceof Error ? err.message : "不明なエラー"}`);
      setImportStep("idle");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← トップに戻る
        </Link>
        <h1 className="text-2xl font-bold mt-2">新しい動画をチェック</h1>
      </div>

      <div className="space-y-8">
        {/* Video Upload */}
        <section>
          <h2 className="text-lg font-semibold mb-3">1. 動画ファイル</h2>
          <VideoUploader />
        </section>

        {/* Config */}
        <section>
          <h2 className="text-lg font-semibold mb-3">2. チェックルール設定</h2>
          <AnalysisConfigForm />
        </section>

        {/* Start Button */}
        <div className="pt-4">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            解析開始
          </button>
          {!draftVideo && (
            <p className="text-sm text-gray-400 text-center mt-2">
              動画ファイルをアップロードしてください
            </p>
          )}
        </div>

        {/* Test Data Import */}
        <section className="border-t border-gray-200 pt-8">
          <h2 className="text-lg font-semibold mb-1">テスト用データ読み込み</h2>
          <p className="text-sm text-gray-500 mb-4">
            動画ファイルとVideo Intelligence APIのJSON結果をインポートして、解析画面を直接表示します。
          </p>

          <div className="space-y-3">
            {/* Video file */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">動画ファイル</label>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setTestVideo(e.target.files?.[0] || null)}
              />
              <button
                onClick={() => videoInputRef.current?.click()}
                className="w-full text-left px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                {testVideo ? (
                  <span className="text-gray-800">{testVideo.name} ({(testVideo.size / 1024 / 1024).toFixed(1)} MB)</span>
                ) : (
                  <span className="text-gray-400">動画ファイルを選択...</span>
                )}
              </button>
            </div>

            {/* JSON file */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VI API JSON結果</label>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => setTestJson(e.target.files?.[0] || null)}
              />
              <button
                onClick={() => jsonInputRef.current?.click()}
                className="w-full text-left px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                {testJson ? (
                  <span className="text-gray-800">{testJson.name} ({(testJson.size / 1024 / 1024).toFixed(1)} MB)</span>
                ) : (
                  <span className="text-gray-400">JSONファイルを選択...</span>
                )}
              </button>
            </div>

            <button
              onClick={handleImportTest}
              disabled={!testVideo || !testJson || importStep !== "idle"}
              className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {IMPORT_STEP_LABELS[importStep]}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
