"use client";

import { use, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useProjectStore } from "@/stores/useProjectStore";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/video/VideoPlayer";
import { VideoTimeline } from "@/components/video/VideoTimeline";
import { SceneNavigator } from "@/components/video/SceneNavigator";
import { SceneSidebar } from "@/components/analysis/SceneSidebar";
import { SceneDetailPanel } from "@/components/analysis/SceneDetailPanel";
import { IssueList } from "@/components/analysis/IssueList";
import { AnalysisProgress } from "@/components/analysis/AnalysisProgress";
import { AnalysisLogPanel, type LogEntry } from "@/components/analysis/AnalysisLogPanel";
import type { Scene } from "@/types/scene";
import type { Issue } from "@/types/issue";
import { DEMO_SCENES, DEMO_ISSUES } from "@/lib/demoData";

export default function ReviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPanelOpen, setLogPanelOpen] = useState(true);

  const draftVideo = useProjectStore((s) => s.draftVideo);
  const analysisStatus = useProjectStore((s) => s.analysisStatus);
  const scenes = useProjectStore((s) => s.scenes);
  const currentSceneIndex = useProjectStore((s) => s.currentSceneIndex);
  const setAnalysisStatus = useProjectStore((s) => s.setAnalysisStatus);
  const setScenes = useProjectStore((s) => s.setScenes);
  const setIssues = useProjectStore((s) => s.setIssues);
  const draftConfig = useProjectStore((s) => s.draftConfig);
  const projectName = useProjectStore((s) => s.projectName);
  const videoFile = useProjectStore((s) => s.videoFile);

  const currentScene = scenes[currentSceneIndex] || null;

  const seekTo = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  const handleSceneClick = useCallback(
    (index: number) => {
      const scene = scenes[index];
      if (scene) {
        seekTo(scene.startTimeSeconds);
      }
    },
    [scenes, seekTo]
  );

  const startAnalysis = useCallback(async () => {
    if (!videoFile) {
      alert("動画ファイルがありません。アップロード画面に戻ってください。");
      return;
    }

    setAnalysisStatus("uploading");
    setLogs([]);

    const formData = new FormData();
    formData.append("video", videoFile);
    formData.append("config", JSON.stringify(draftConfig));
    formData.append("duration", String(draftVideo?.duration || 0));

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const dataLine = line.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));

            if (payload.type === "log") {
              setLogs((prev) => [...prev, payload.data as LogEntry]);
            } else if (payload.type === "status") {
              setAnalysisStatus(payload.data.status);
            } else if (payload.type === "result") {
              setScenes(payload.data.scenes as Scene[]);
              setIssues(payload.data.issues as Issue[]);
              setAnalysisStatus("completed");
            } else if (payload.type === "error") {
              setAnalysisStatus("failed");
              setLogs((prev) => [
                ...prev,
                {
                  level: "error",
                  message: payload.data.message,
                  detail: null,
                  timestamp: new Date().toISOString(),
                },
              ]);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setAnalysisStatus("failed");
      setLogs((prev) => [
        ...prev,
        {
          level: "error",
          message: `通信エラー: ${err instanceof Error ? err.message : "不明なエラー"}`,
          detail: null,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [videoFile, draftConfig, draftVideo, setAnalysisStatus, setScenes, setIssues]);

  const loadDemo = useCallback(() => {
    setScenes(DEMO_SCENES);
    setIssues(DEMO_ISSUES);
    setAnalysisStatus("completed");
  }, [setScenes, setIssues, setAnalysisStatus]);

  // No video uploaded
  if (!draftVideo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-500">動画がアップロードされていません</p>
          <Link
            href="/projects/new"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg"
          >
            アップロード画面へ
          </Link>
        </div>
      </div>
    );
  }

  // Analyzing state
  if (analysisStatus !== "pending" && analysisStatus !== "completed" && analysisStatus !== "failed") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-6">解析中...</h1>
        <AnalysisProgress status={analysisStatus} />
        <div className="mt-6">
          <AnalysisLogPanel logs={logs} isOpen={logPanelOpen} onToggle={() => setLogPanelOpen(!logPanelOpen)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/projects/new" className="text-gray-400 hover:text-gray-600">
            ← 戻る
          </Link>
          <h1 className="font-semibold text-gray-900">
            {projectName || `プロジェクト ${projectId.slice(0, 6)}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {analysisStatus === "pending" && (
            <>
              <button
                onClick={loadDemo}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                デモデータ
              </button>
              <button
                onClick={startAnalysis}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                AI解析を開始
              </button>
            </>
          )}
          {analysisStatus === "failed" && (
            <button
              onClick={startAnalysis}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              再試行
            </button>
          )}
          {analysisStatus === "completed" && (
            <Link
              href={`/projects/${projectId}/report`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              レポート出力
            </Link>
          )}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex">
        {/* Left sidebar */}
        <aside className="w-64 border-r border-gray-200 bg-white p-4 min-h-[calc(100vh-57px)] overflow-y-auto">
          <SceneSidebar onSceneClick={handleSceneClick} />
          <div className="mt-6">
            <IssueList onIssueClick={seekTo} />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 space-y-4">
          {/* Pending state prompt */}
          {analysisStatus === "pending" && scenes.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-blue-700">
                「AI解析を開始」ボタンを押して解析を開始してください
              </p>
            </div>
          )}

          {/* Video player */}
          <VideoPlayer
            ref={playerRef}
            src={draftVideo.url}
            onTimeUpdate={setCurrentTime}
          />

          {/* Scene navigator */}
          <SceneNavigator />

          {/* Timeline */}
          <VideoTimeline
            duration={draftVideo.duration}
            currentTime={currentTime}
            onSeek={seekTo}
          />

          {/* Scene detail */}
          <SceneDetailPanel
            scene={currentScene}
            onTimestampClick={seekTo}
          />

          {/* Log panel */}
          {logs.length > 0 && (
            <AnalysisLogPanel
              logs={logs}
              isOpen={logPanelOpen}
              onToggle={() => setLogPanelOpen(!logPanelOpen)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
