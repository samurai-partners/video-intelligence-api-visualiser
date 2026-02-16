"use client";

import { useMemo } from "react";
import type { Scene } from "@/types/scene";
import { formatTime, deduplicateDetectedText } from "@/lib/utils";

interface TextPanelProps {
  scene: Scene | null;
  currentTime?: number;
  onTimestampClick?: (time: number) => void;
}

export function TextPanel({ scene, currentTime = 0, onTimestampClick }: TextPanelProps) {
  const dedupedText = useMemo(
    () => (scene ? deduplicateDetectedText(scene.viData.detectedText) : []),
    [scene]
  );

  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-xs">
        シーンを選択
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-gray-700">動画内のテキスト</h3>
          <span className="text-[10px] text-gray-400">#{scene.index + 1} {formatTime(scene.startTimeSeconds)}</span>
        </div>

        {/* Gemini text summary */}
        {scene.geminiAnalysis?.detectedTextSummary && (
          <p className="text-[11px] text-orange-700 bg-orange-50 rounded px-2 py-1 mb-1">
            {scene.geminiAnalysis.detectedTextSummary}
          </p>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2">
        {/* OCR detected text list for current scene */}
        {dedupedText.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-2">テキストなし</p>
        ) : (
          <div className="space-y-0.5">
            {dedupedText.map((t, i) => (
              <button
                key={i}
                onClick={() => onTimestampClick?.(t.startTimeSeconds)}
                className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 transition-colors text-[11px]"
              >
                <span className="text-gray-800">「{t.text}」</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
