"use client";

import { use, useState, useRef, useCallback, useEffect } from "react";
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
import { VideoOverlay, type DetectionType } from "@/components/video/VideoOverlay";
import type { Scene } from "@/types/scene";
import type { Issue } from "@/types/issue";

const DETECTION_TYPE_LABELS: Record<DetectionType, string> = {
  person: "人物",
  face: "顔",
  object: "物体",
  logo: "ロゴ",
  text: "テキスト",
};

const DETECTION_TYPE_COLORS: Record<DetectionType, string> = {
  person: "bg-blue-500",
  face: "bg-cyan-500",
  object: "bg-green-500",
  logo: "bg-yellow-500",
  text: "bg-orange-500",
};

export default function ReviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [overlayTypes, setOverlayTypes] = useState<Set<DetectionType>>(
    new Set(["person", "face", "object", "logo", "text"])
  );

  // Resizable column widths
  const [leftWidth, setLeftWidth] = useState(120);
  const [rightWidth, setRightWidth] = useState(288);
  const [videoHeight, setVideoHeight] = useState(280);
  const draggingRef = useRef<"left" | "right" | null>(null);
  const verticalDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const centerColumnRef = useRef<HTMLDivElement>(null);

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
  const transcriptionProgress = useProjectStore((s) => s.transcriptionProgress);

  const currentScene = scenes[currentSceneIndex] || null;
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);

  const seekTo = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
  }, []);

  // Auto-update currentSceneIndex during playback
  useEffect(() => {
    if (scenes.length === 0) return;
    const scene = scenes[currentSceneIndex];
    if (!scene) return;
    // If currentTime is within the current scene, no update needed
    if (currentTime >= scene.startTimeSeconds && currentTime < scene.endTimeSeconds) return;
    // Find the scene that contains currentTime
    for (let i = 0; i < scenes.length; i++) {
      if (currentTime >= scenes[i].startTimeSeconds && currentTime < scenes[i].endTimeSeconds) {
        setCurrentSceneIndex(i);
        return;
      }
    }
    // Handle edge case: time is at or past the last scene's end
    if (currentTime >= scenes[scenes.length - 1].startTimeSeconds) {
      setCurrentSceneIndex(scenes.length - 1);
    }
  }, [currentTime, scenes, currentSceneIndex, setCurrentSceneIndex]);

  const handleSceneClick = useCallback(
    (index: number) => {
      const scene = scenes[index];
      if (scene) {
        setCurrentSceneIndex(index);
        seekTo(scene.startTimeSeconds);
      }
    },
    [scenes, seekTo, setCurrentSceneIndex]
  );

  // Arrow key scene navigation + video seek
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (scenes.length === 0) return;

      const { currentSceneIndex: idx } = useProjectStore.getState();
      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        const newIdx = idx - 1;
        setCurrentSceneIndex(newIdx);
        const scene = scenes[newIdx];
        if (scene) playerRef.current?.seekTo(scene.startTimeSeconds);
      } else if (e.key === "ArrowRight" && idx < scenes.length - 1) {
        e.preventDefault();
        const newIdx = idx + 1;
        setCurrentSceneIndex(newIdx);
        const scene = scenes[newIdx];
        if (scene) playerRef.current?.seekTo(scene.startTimeSeconds);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scenes, setCurrentSceneIndex]);

  // Column + vertical resize handler
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      e.preventDefault();

      if (draggingRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (draggingRef.current === "left") {
          setLeftWidth(Math.max(80, Math.min(300, e.clientX - rect.left)));
        } else {
          setRightWidth(Math.max(200, Math.min(500, rect.right - e.clientX)));
        }
      } else if (verticalDraggingRef.current && centerColumnRef.current) {
        const centerRect = centerColumnRef.current.getBoundingClientRect();
        const newHeight = Math.max(120, Math.min(centerRect.height - 100, e.clientY - centerRect.top));
        setVideoHeight(newHeight);
      }
    }

    function handleMouseUp() {
      draggingRef.current = null;
      verticalDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const startDrag = (side: "left" | "right") => {
    draggingRef.current = side;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const startVerticalDrag = () => {
    verticalDraggingRef.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  // SSE stream reader - shared between live and mock analysis
  const readSSEStream = useCallback(async (response: Response) => {
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
          } else if (payload.type === "transcription_scene") {
            const { sceneIndex, geminiTranscription, completedScenes, totalScenes } = payload.data;
            const store = useProjectStore.getState();
            if (geminiTranscription) {
              store.updateScenesTranscription([{
                index: sceneIndex,
                geminiTranscription,
              }]);
            }
            store.setTranscriptionProgress({ completed: completedScenes, total: totalScenes });
          } else if (payload.type === "result") {
            setScenes(payload.data.scenes as Scene[]);
            setIssues(payload.data.issues as Issue[]);
            useProjectStore.getState().setTranscriptionProgress(null);
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
  }, [setAnalysisStatus, setScenes, setIssues]);

  const startAnalysis = useCallback(async (mock = false) => {
    if (!mock && !videoFile) {
      alert("動画ファイルがありません。アップロード画面に戻ってください。");
      return;
    }

    setAnalysisStatus("uploading");
    setLogs([]);

    // Load sample video for playback if mock mode and no video loaded
    if (mock && !draftVideo) {
      const setDraftVideo = useProjectStore.getState().setDraftVideo;
      setDraftVideo({
        file: null,
        url: "/sample/test_video.mp4",
        name: "test_video.mp4 (サンプル)",
        duration: 252.669,
        size: 28 * 1024 * 1024,
      });
    }

    const formData = new FormData();
    if (!mock && videoFile) {
      formData.append("video", videoFile);
    }
    formData.append("config", JSON.stringify(draftConfig));
    formData.append("duration", String(mock ? 252.669 : (draftVideo?.duration || 0)));
    if (mock) {
      formData.append("mock", "true");
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await readSSEStream(response);
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
  }, [videoFile, draftConfig, draftVideo, setAnalysisStatus, readSSEStream]);

  // No video uploaded - offer sample or upload
  if (!draftVideo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-gray-500">動画がアップロードされていません</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => startAnalysis(true)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              サンプル動画で解析
            </button>
            <Link
              href="/projects/new"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg"
            >
              動画をアップロード
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Analyzing state - show progress with log (importing_transcribe shows review UI with banner)
  if (analysisStatus !== "pending" && analysisStatus !== "completed" && analysisStatus !== "failed" && analysisStatus !== "importing_transcribe") {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-6">解析中...</h1>
        <AnalysisProgress status={analysisStatus} />
        <div className="mt-6">
          <AnalysisLogPanel logs={logs} isOpen={true} onToggle={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-1.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/projects/new" className="text-gray-400 hover:text-gray-600 text-xs">
            ← 戻る
          </Link>
          <h1 className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
            {projectName || `プロジェクト ${projectId.slice(0, 6)}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {analysisStatus === "pending" && (
            <>
              <button
                onClick={() => startAnalysis(true)}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
              >
                サンプルJSONで解析
              </button>
              <button
                onClick={() => startAnalysis(false)}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                AI解析を開始
              </button>
            </>
          )}
          {analysisStatus === "failed" && (
            <button
              onClick={() => startAnalysis(false)}
              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
            >
              再試行
            </button>
          )}
          {(analysisStatus === "completed" || analysisStatus === "importing_transcribe") && (
            <Link
              href={`/projects/${projectId}/report`}
              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
            >
              レポート出力
            </Link>
          )}
          {/* Log button */}
          {logs.length > 0 && (
            <button
              onClick={() => setLogModalOpen(true)}
              className="px-2 py-1 bg-gray-800 text-gray-300 rounded text-xs font-mono hover:bg-gray-700 transition-colors"
            >
              ログ ({logs.length})
            </button>
          )}
        </div>
      </header>

      {/* 3-column resizable layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Left: Scene list */}
        <aside
          className="border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto p-2"
          style={{ width: leftWidth }}
        >
          <SceneSidebar onSceneClick={handleSceneClick} />
        </aside>

        {/* Left resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-blue-300 active:bg-blue-400 transition-colors"
          onMouseDown={() => startDrag("left")}
        />

        {/* Center: Video + Timeline + Scene Detail */}
        <div ref={centerColumnRef} className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Pending prompt */}
          {analysisStatus === "pending" && scenes.length === 0 && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 text-center flex-shrink-0">
              <p className="text-blue-700 text-xs">
                「AI解析を開始」or「サンプルJSONで解析」を押してください
              </p>
            </div>
          )}

          {/* Gemini transcription in progress banner */}
          {analysisStatus === "importing_transcribe" && (
            <div className="bg-purple-50 border-b border-purple-200 px-4 py-1.5 text-center flex-shrink-0">
              <p className="text-purple-700 text-xs flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                {transcriptionProgress
                  ? `Gemini文字起こし中... ${transcriptionProgress.completed}/${transcriptionProgress.total} シーン完了`
                  : "Gemini高品質文字起こし中... 完了次第、音声データが自動更新されます"
                }
              </p>
              {transcriptionProgress && (
                <div className="mt-1 mx-auto max-w-xs h-1 bg-purple-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${(transcriptionProgress.completed / transcriptionProgress.total * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Video player - fixed height, no overflow */}
          <div className="flex-shrink-0">
            <VideoPlayer
              ref={playerRef}
              src={draftVideo.url}
              onTimeUpdate={setCurrentTime}
              height={videoHeight}
              overlay={
                overlayTypes.size > 0 ? (
                  <VideoOverlay
                    videoElement={playerRef.current?.getVideoElement() ?? null}
                    currentTime={currentTime}
                    scene={currentScene}
                    enabledTypes={overlayTypes}
                  />
                ) : undefined
              }
            />
          </div>

          {/* Timeline + nav bar */}
          <div className="flex-shrink-0 px-2 py-1 border-b border-gray-200 bg-white">
            <VideoTimeline
              duration={draftVideo.duration}
              currentTime={currentTime}
              onSeek={seekTo}
            />
            <div className="flex items-center gap-2">
              <SceneNavigator />
              <div className="ml-auto flex items-center gap-1.5">
                {(Object.keys(DETECTION_TYPE_LABELS) as DetectionType[]).map((type) => {
                  const enabled = overlayTypes.has(type);
                  return (
                    <label
                      key={type}
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded cursor-pointer text-[10px] font-medium transition-colors select-none ${
                        enabled
                          ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          : "bg-gray-50 text-gray-300 hover:bg-gray-100"
                      }`}
                    >
                      <span className={`inline-block w-2 h-2 rounded-sm ${enabled ? DETECTION_TYPE_COLORS[type] : "bg-gray-300"}`} />
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={enabled}
                        onChange={() => {
                          setOverlayTypes((prev) => {
                            const next = new Set(prev);
                            if (next.has(type)) next.delete(type);
                            else next.add(type);
                            return next;
                          });
                        }}
                      />
                      {DETECTION_TYPE_LABELS[type]}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Vertical resize handle */}
          <div
            className="h-1 flex-shrink-0 cursor-row-resize bg-transparent hover:bg-blue-300 active:bg-blue-400 transition-colors"
            onMouseDown={startVerticalDrag}
          />

          {/* Scene detail - fills remaining space */}
          <div className="flex-1 min-h-0 bg-white">
            <SceneDetailPanel
              scene={currentScene}
              currentTime={currentTime}
              onTimestampClick={seekTo}
            />
          </div>
        </div>

        {/* Right resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-blue-300 active:bg-blue-400 transition-colors"
          onMouseDown={() => startDrag("right")}
        />

        {/* Right: Issues panel */}
        <aside
          className="border-l border-gray-200 bg-white flex-shrink-0 overflow-y-auto p-3"
          style={{ width: rightWidth }}
        >
          <IssueList onIssueClick={seekTo} />
        </aside>
      </div>

      {/* Log modal overlay */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-gray-900 rounded-lg shadow-2xl w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
              <span className="text-sm font-mono text-gray-300">解析ログ ({logs.length})</span>
              <button
                onClick={() => setLogModalOpen(false)}
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                x 閉じる
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <span className="text-gray-600 flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString("ja-JP")}
                  </span>
                  <span className={`flex-shrink-0 ${
                    log.level === "error" ? "text-red-400" :
                    log.level === "warn" ? "text-yellow-400" :
                    log.level === "success" ? "text-green-400" : "text-blue-400"
                  }`}>
                    [{log.level === "success" ? " OK " : log.level.toUpperCase()}]
                  </span>
                  <span className="text-gray-300">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
