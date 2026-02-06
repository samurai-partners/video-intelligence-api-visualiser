"use client";

import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime } from "@/lib/utils";

interface SceneSidebarProps {
  onSceneClick?: (index: number) => void;
}

export function SceneSidebar({ onSceneClick }: SceneSidebarProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const currentSceneIndex = useProjectStore((s) => s.currentSceneIndex);
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);

  const handleClick = (index: number) => {
    setCurrentSceneIndex(index);
    onSceneClick?.(index);
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        シーン一覧
      </p>
      {scenes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">シーンなし</p>
      ) : (
        <div className="space-y-0.5 max-h-[500px] overflow-y-auto">
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
                onClick={() => handleClick(scene.index)}
                className={`
                  w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2
                  ${isActive ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}
                `}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <span className="truncate">
                  シーン {scene.index + 1}
                </span>
                <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
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
