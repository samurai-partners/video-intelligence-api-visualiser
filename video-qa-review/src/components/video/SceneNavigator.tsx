"use client";

import { useSceneNavigation } from "@/hooks/useSceneNavigation";
import { formatTime } from "@/lib/utils";

export function SceneNavigator() {
  const { currentSceneIndex, currentScene, totalScenes, goToPrevScene, goToNextScene, hasPrev, hasNext } =
    useSceneNavigation();

  if (totalScenes === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-1 text-gray-400 text-xs">
        シーンデータなし
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 py-1">
      <button
        onClick={goToPrevScene}
        disabled={!hasPrev}
        className="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-gray-100 hover:bg-gray-200 text-gray-700"
      >
        ← 前へ
      </button>
      <span className="text-xs text-gray-600 min-w-[100px] text-center">
        シーン {currentSceneIndex + 1} / {totalScenes}
        {currentScene && (
          <span className="text-gray-400 ml-1">
            ({formatTime(currentScene.startTimeSeconds)})
          </span>
        )}
      </span>
      <button
        onClick={goToNextScene}
        disabled={!hasNext}
        className="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-gray-100 hover:bg-gray-200 text-gray-700"
      >
        次へ →
      </button>
    </div>
  );
}
