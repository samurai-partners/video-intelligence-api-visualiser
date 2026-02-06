"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime } from "@/lib/utils";

interface SceneSidebarProps {
  onSceneClick?: (index: number) => void;
}

export function SceneSidebar({ onSceneClick }: SceneSidebarProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const currentSceneIndex = useProjectStore((s) => s.currentSceneIndex);
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

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

  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5 px-1">
        シーン {scenes.length > 0 && `(${scenes.length})`}
      </p>
      {scenes.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">シーンなし</p>
      ) : (
        <div className="space-y-px">
          {scenes.map((scene) => {
            const risk = scene.geminiAnalysis?.overallRisk || "low";
            const issueCount = scene.geminiAnalysis?.issues.length || 0;
            const isActive = scene.index === currentSceneIndex;

            const dot =
              risk === "high"
                ? "bg-red-500"
                : risk === "medium"
                ? "bg-yellow-500"
                : issueCount > 0
                ? "bg-yellow-400"
                : "bg-gray-300";

            return (
              <button
                key={scene.index}
                ref={(el) => {
                  if (el) itemRefs.current.set(scene.index, el);
                }}
                onClick={() => handleClick(scene.index)}
                className={`
                  w-full text-left px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5
                  ${isActive ? "bg-blue-100 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-50"}
                `}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <span className="truncate">
                  {scene.index + 1}
                </span>
                <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                  {formatTime(scene.startTimeSeconds)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
