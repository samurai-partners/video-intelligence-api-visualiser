"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime } from "@/lib/utils";

interface SceneSidebarProps {
  onSceneClick?: (index: number) => void;
  videoSrc?: string;
}

export function SceneSidebar({ onSceneClick, videoSrc }: SceneSidebarProps) {
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

  // Capture thumbnails using a hidden offscreen video element (not the main player)
  const captureThumbnails = useCallback(async (src: string) => {
    if (scenes.length === 0 || capturingRef.current) return;

    capturingRef.current = true;

    // Create a separate offscreen video for thumbnail capture
    const offscreenVideo = document.createElement("video");
    offscreenVideo.src = src;
    offscreenVideo.muted = true;
    offscreenVideo.preload = "auto";

    // Wait for video to be ready
    await new Promise<void>((resolve) => {
      if (offscreenVideo.readyState >= 2) { resolve(); return; }
      offscreenVideo.addEventListener("loadeddata", () => resolve(), { once: true });
      // Timeout
      setTimeout(resolve, 10000);
    });

    if (offscreenVideo.readyState < 2) {
      capturingRef.current = false;
      return;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { capturingRef.current = false; return; }

    const vw = offscreenVideo.videoWidth;
    const vh = offscreenVideo.videoHeight;
    const thumbW = 160;
    const thumbH = Math.round((vh / vw) * thumbW);
    canvas.width = thumbW;
    canvas.height = thumbH;

    const newThumbs = new Map<number, string>();

    for (const scene of scenes) {
      if (thumbnails.has(scene.index)) {
        newThumbs.set(scene.index, thumbnails.get(scene.index)!);
        continue;
      }

      try {
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            offscreenVideo.removeEventListener("seeked", onSeeked);
            try {
              ctx.drawImage(offscreenVideo, 0, 0, thumbW, thumbH);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
              newThumbs.set(scene.index, dataUrl);
            } catch {
              // skip
            }
            resolve();
          };
          offscreenVideo.addEventListener("seeked", onSeeked);
          offscreenVideo.currentTime = Math.min(
            scene.startTimeSeconds + 0.5,
            scene.endTimeSeconds
          );
          setTimeout(() => {
            offscreenVideo.removeEventListener("seeked", onSeeked);
            resolve();
          }, 2000);
        });
      } catch {
        // skip
      }
    }

    // Clean up offscreen video
    offscreenVideo.src = "";
    offscreenVideo.load();

    setThumbnails(newThumbs);
    capturingRef.current = false;
  }, [scenes, thumbnails]);

  // Trigger thumbnail capture when video src and scenes are ready
  useEffect(() => {
    if (!videoSrc || scenes.length === 0 || thumbnails.size >= scenes.length) return;
    captureThumbnails(videoSrc);
  }, [videoSrc, scenes.length, captureThumbnails, thumbnails.size]);

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
                {thumb ? (
                  <div className="relative w-full aspect-video bg-gray-100">
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                    <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                      {scene.index + 1}
                    </span>
                    <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1 rounded">
                      {formatTime(scene.startTimeSeconds)}
                    </span>
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
