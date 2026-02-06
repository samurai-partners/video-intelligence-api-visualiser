"use client";

import { useProjectStore } from "@/stores/useProjectStore";
import type { Scene } from "@/types/scene";

interface VideoTimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function VideoTimeline({ duration, currentTime, onSeek }: VideoTimelineProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const issues = useProjectStore((s) => s.issues);
  const currentSceneIndex = useProjectStore((s) => s.currentSceneIndex);

  if (duration <= 0) return null;

  const progressPercent = (currentTime / duration) * 100;

  return (
    <div className="relative w-full">
      {/* Timeline bar */}
      <div
        className="relative h-10 bg-gray-200 rounded-lg overflow-hidden cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percent = x / rect.width;
          onSeek(percent * duration);
        }}
      >
        {/* Scene segments */}
        {scenes.map((scene, i) => {
          const left = (scene.startTimeSeconds / duration) * 100;
          const width = (scene.durationSeconds / duration) * 100;
          const risk = scene.geminiAnalysis?.overallRisk || "low";
          const bgColor =
            risk === "high"
              ? "bg-red-200"
              : risk === "medium"
              ? "bg-yellow-200"
              : i === currentSceneIndex
              ? "bg-blue-200"
              : i % 2 === 0
              ? "bg-gray-100"
              : "bg-gray-200";

          return (
            <div
              key={scene.index}
              className={`absolute top-0 h-full ${bgColor} border-r border-gray-300`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}

        {/* Issue markers */}
        {issues.map((issue) => {
          const left = (issue.timestampSeconds / duration) * 100;
          const color =
            issue.severity === "critical"
              ? "bg-red-500"
              : issue.severity === "warning"
              ? "bg-yellow-500"
              : "bg-blue-500";

          return (
            <div
              key={issue.id}
              className={`absolute top-0 w-1.5 h-full ${color} opacity-80`}
              style={{ left: `${left}%` }}
              title={issue.title}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 w-0.5 h-full bg-white shadow-lg z-10"
          style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
