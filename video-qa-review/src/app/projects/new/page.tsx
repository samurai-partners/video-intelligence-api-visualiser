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
  const [importing, setImporting] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleImportTest = async () => {
    if (!testVideo || !testJson) return;
    setImporting(true);

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

      // Send JSON to server for parsing
      const formData = new FormData();
      formData.append("json", testJson);
      formData.append("duration", String(duration));
      formData.append("config", JSON.stringify(store.draftConfig));

      const response = await fetch("/api/import-json", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const { scenes, issues } = await response.json() as { scenes: Scene[]; issues: Issue[] };

      store.setScenes(scenes);
      store.setIssues(issues);
      store.setAnalysisStatus("completed");

      const projectId = generateId();
      router.push(`/projects/${projectId}`);
    } catch (err) {
      alert(`インポート失敗: ${err instanceof Error ? err.message : "不明なエラー"}`);
    } finally {
      setImporting(false);
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
              disabled={!testVideo || !testJson || importing}
              className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? "読み込み中..." : "テストデータで表示"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
