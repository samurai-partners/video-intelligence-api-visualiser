"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Scene, BoundingBox } from "@/types/scene";

interface VideoOverlayProps {
  videoElement: HTMLVideoElement | null;
  currentTime: number;
  scene: Scene | null;
}

interface VideoRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Detection {
  type: "person" | "face" | "object" | "logo";
  label?: string;
  box: BoundingBox;
  landmarks?: Array<{ name: string; x: number; y: number }>;
}

const COLORS: Record<Detection["type"], { border: string; bg: string; label: string }> = {
  person: { border: "#3b82f6", bg: "rgba(59,130,246,0.1)", label: "人物" },
  face: { border: "#06b6d4", bg: "rgba(6,182,212,0.1)", label: "顔" },
  object: { border: "#22c55e", bg: "rgba(34,197,94,0.1)", label: "" },
  logo: { border: "#eab308", bg: "rgba(234,179,8,0.1)", label: "" },
};

/**
 * Calculate where the video is actually rendered within its container,
 * accounting for object-fit and letterboxing.
 * We use getBoundingClientRect on the video element and compare
 * with its parent container to get the correct offset.
 */
function computeVideoRect(video: HTMLVideoElement): VideoRect {
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  const elemW = video.clientWidth;
  const elemH = video.clientHeight;

  if (!videoW || !videoH || !elemW || !elemH) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  // The <video> element uses default object-fit (which is "fill" for replaced elements,
  // but browsers actually render video content maintaining aspect ratio within the element bounds)
  // With max-w-full max-h-full, the video element itself is sized to fit.
  // The video content fills the entire element since the element is auto-sized.

  // Get the video element's position relative to its offset parent (the relative container)
  const container = video.parentElement;
  if (!container) return { left: 0, top: 0, width: elemW, height: elemH };

  const containerRect = container.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();

  return {
    left: videoRect.left - containerRect.left,
    top: videoRect.top - containerRect.top,
    width: videoRect.width,
    height: videoRect.height,
  };
}

export function VideoOverlay({ videoElement, currentTime, scene }: VideoOverlayProps) {
  const [videoRect, setVideoRect] = useState<VideoRect>({ left: 0, top: 0, width: 0, height: 0 });
  const rafRef = useRef<number>(0);

  const updateRect = useCallback(() => {
    if (!videoElement) return;
    setVideoRect(computeVideoRect(videoElement));
  }, [videoElement]);

  useEffect(() => {
    if (!videoElement) return;

    updateRect();

    const observer = new ResizeObserver(updateRect);
    observer.observe(videoElement);
    if (videoElement.parentElement) {
      observer.observe(videoElement.parentElement);
    }

    videoElement.addEventListener("loadedmetadata", updateRect);

    return () => {
      observer.disconnect();
      videoElement.removeEventListener("loadedmetadata", updateRect);
    };
  }, [videoElement, updateRect]);

  // Also update rect on currentTime change (handles seek/play)
  useEffect(() => {
    updateRect();
  }, [currentTime, updateRect]);

  // Collect detections for current time
  const detections = useMemo((): Detection[] => {
    if (!scene) return [];
    const result: Detection[] = [];
    const tolerance = 0.5;

    for (const person of scene.viData.persons) {
      if (currentTime < person.startTimeSeconds || currentTime > person.endTimeSeconds) continue;
      const nearest = findNearest(person.timestampedObjects, currentTime, tolerance);
      if (nearest) {
        result.push({
          type: "person",
          box: nearest.boundingBox,
          landmarks: nearest.landmarks,
        });
      }
    }

    for (const face of scene.viData.faces) {
      if (currentTime < face.startTimeSeconds || currentTime > face.endTimeSeconds) continue;
      const nearest = findNearest(face.timestampedObjects, currentTime, tolerance);
      if (nearest) {
        result.push({ type: "face", box: nearest.boundingBox });
      }
    }

    for (const obj of scene.viData.objects) {
      if (currentTime < obj.startTimeSeconds || currentTime > obj.endTimeSeconds) continue;
      const nearest = findNearest(obj.frames, currentTime, tolerance);
      if (nearest) {
        result.push({ type: "object", label: obj.description, box: nearest.boundingBox });
      }
    }

    for (const logo of scene.viData.logos) {
      if (currentTime < logo.startTimeSeconds || currentTime > logo.endTimeSeconds) continue;
      result.push({ type: "logo", label: logo.description, box: logo.boundingBox });
    }

    return result;
  }, [scene, currentTime]);

  if (!videoElement || videoRect.width === 0 || detections.length === 0) return null;

  return (
    <div
      className="absolute pointer-events-none overflow-hidden"
      style={{
        left: videoRect.left,
        top: videoRect.top,
        width: videoRect.width,
        height: videoRect.height,
        zIndex: 10,
      }}
    >
      {detections.map((det, i) => {
        const color = COLORS[det.type];
        const x = det.box.left * videoRect.width;
        const y = det.box.top * videoRect.height;
        const w = (det.box.right - det.box.left) * videoRect.width;
        const h = (det.box.bottom - det.box.top) * videoRect.height;

        return (
          <div key={`${det.type}-${i}`}>
            <div
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: w,
                height: h,
                border: `2px solid ${color.border}`,
                backgroundColor: color.bg,
                boxSizing: "border-box",
              }}
            >
              {(det.label || color.label) && (
                <span
                  style={{
                    position: "absolute",
                    top: -16,
                    left: -1,
                    background: color.border,
                    color: "#fff",
                    fontSize: 10,
                    padding: "0px 3px",
                    whiteSpace: "nowrap",
                    lineHeight: "14px",
                  }}
                >
                  {det.label || color.label}
                </span>
              )}
            </div>

            {det.landmarks?.map((lm, j) => (
              <div
                key={`lm-${j}`}
                style={{
                  position: "absolute",
                  left: lm.x * videoRect.width - 3,
                  top: lm.y * videoRect.height - 3,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#ef4444",
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function findNearest<T extends { timeSeconds: number }>(objects: T[], time: number, tolerance: number): T | null {
  if (objects.length === 0) return null;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const obj of objects) {
    const dist = Math.abs(obj.timeSeconds - time);
    if (dist < bestDist) {
      bestDist = dist;
      best = obj;
    }
  }
  return bestDist <= tolerance ? best : null;
}
