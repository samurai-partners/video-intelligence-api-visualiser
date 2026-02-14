"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime } from "@/lib/utils";

interface SceneSidebarProps {
  onSceneClick?: (index: number) => void;
  videoElement?: HTMLVideoElement | null;
}

export function SceneSidebar({ onSceneClick, videoElement }: SceneSidebarProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const currentSceneIndex = useProjectStore((s) => s.currentSceneIndex);
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);
  const analysisStatus = useProjectStore((s) => s.analysisStatus);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const isTranscribing = analysisStatus === "importing_transcribe";
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const capturingRef = useRef(false);

  const handleClick = (index: number) => {
    setCurrentSceneIndex(index);
    onSceneClick?.(index);
  };

  // Auto-scroll to active scene
  useEffect(() => {
    const el = itemRefs.current.get(currentSceneIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentSceneIndex]);

  // Capture thumbnails from video
  const captureThumbnails = useCallback(async () => {
    if (!videoElement || scenes.length === 0 || capturingRef.current) return;
    if (videoElement.readyState < 2) return; // not enough data

    capturingRef.current = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { capturingRef.current = false; return; }

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    // Small thumbnail: 160px wide, maintain aspect ratio
    const thumbW = 160;
    const thumbH = Math.round((vh / vw) * thumbW);
    canvas.width = thumbW;
    canvas.height = thumbH;

    const savedTime = videoElement.currentTime;
    const wasPaused = videoElement.paused;
    if (!wasPaused) videoElement.pause();

    const newThumbs = new Map<number, string>();

    for (const scene of scenes) {
      // Skip if already captured
      if (thumbnails.has(scene.index)) {
        newThumbs.set(scene.index, thumbnails.get(scene.index)!);
        continue;
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => {
            videoElement.removeEventListener("seeked", onSeeked);
            try {
              ctx.drawImage(videoElement, 0, 0, thumbW, thumbH);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
              newThumbs.set(scene.index, dataUrl);
            } catch {
              // cross-origin or other error — skip
            }
            resolve();
          };
          videoElement.addEventListener("seeked", onSeeked);
          // Seek to 0.5s into the scene (avoid black frames at exact start)
          videoElement.currentTime = Math.min(
            scene.startTimeSeconds + 0.5,
            scene.endTimeSeconds
          );
          // Timeout fallback
          setTimeout(() => {
            videoElement.removeEventListener("seeked", onSeeked);
            resolve();
          }, 2000);
        });
      } catch {
        // skip this scene
      }
    }

    // Restore playback position
    videoElement.currentTime = savedTime;
    if (!wasPaused) videoElement.play();

    setThumbnails(newThumbs);
    capturingRef.current = false;
  }, [videoElement, scenes, thumbnails]);

  // Trigger thumbnail capture when video and scenes are ready
  useEffect(() => {
    if (!videoElement || scenes.length === 0 || thumbnails.size >= scenes.length) return;

    const handleReady = () => captureThumbnails();

    if (videoElement.readyState >= 2) {
      captureThumbnails();
    } else {
      videoElement.addEventListener("loadeddata", handleReady);
      return () => videoElement.removeEventListener("loadeddata", handleReady);
    }
  }, [videoElement, scenes.length, captureThumbnails, thumbnails.size]);

  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5 px-1">
        シーン {scenes.length > 0 && `(${scenes.length})`}
      </p>
      {scenes.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">シーンなし</p>
      ) : (
        <div className="space-y-1">
          {scenes.map((scene) => {
            const risk = scene.geminiAnalysis?.overallRisk || "low";
            const issueCount = scene.geminiAnalysis?.issues.length || 0;
            const isActive = scene.index === currentSceneIndex;

            const hasTranscription = !!scene.geminiTranscription;
            const waitingForTranscription = isTranscribing && !hasTranscription;

            const dot = waitingForTranscription
              ? "bg-purple-400 animate-pulse"
              : hasTranscription
              ? (risk === "high"
                  ? "bg-red-500"
                  : risk === "medium"
                  ? "bg-yellow-500"
                  : issueCount > 0
                  ? "bg-yellow-400"
                  : "bg-green-400")
              : (risk === "high"
                  ? "bg-red-500"
                  : risk === "medium"
                  ? "bg-yellow-500"
                  : issueCount > 0
                  ? "bg-yellow-400"
                  : "bg-gray-300");

            const thumb = thumbnails.get(scene.index);

            return (
              <button
                key={scene.index}
                ref={(el) => {
                  if (el) itemRefs.current.set(scene.index, el);
                }}
                onClick={() => handleClick(scene.index)}
                className={`
                  w-full text-left rounded text-xs transition-colors overflow-hidden
                  ${isActive ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-gray-300"}
                `}
              >
                {/* Thumbnail */}
                {thumb ? (
                  <div className="relative w-full aspect-video bg-gray-100">
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                    {/* Scene number overlay */}
                    <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                      {scene.index + 1}
                    </span>
                    {/* Time overlay */}
                    <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                      {formatTime(scene.startTimeSeconds)}
                    </span>
                    {/* Status dot */}
                    <span className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${dot}`} />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                    <span className="truncate">
                      {scene.index + 1}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                      {formatTime(scene.startTimeSeconds)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
