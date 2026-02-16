"use client";

import { useState, useMemo } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { getAverageBboxArea } from "@/lib/utils";

interface BboxSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const PRESETS = [
  { label: "0.005 (デフォルト)", value: 0.005 },
  { label: "0.01", value: 0.01 },
  { label: "0.02", value: 0.02 },
];

export function BboxSettingsModal({ open, onClose }: BboxSettingsModalProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const bboxThreshold = useProjectStore((s) => s.bboxThreshold);
  const setBboxThreshold = useProjectStore((s) => s.setBboxThreshold);

  const [selectedText, setSelectedText] = useState<string | null>(null);

  // Collect all unique detected text entries with their bbox areas
  const textEntries = useMemo(() => {
    const entries: Array<{ text: string; area: number; sceneIndex: number }> = [];
    for (const scene of scenes) {
      for (const dt of scene.viData.detectedText) {
        if (dt.frames.length === 0) continue;
        const area = getAverageBboxArea(dt.frames);
        entries.push({ text: dt.text, area, sceneIndex: scene.index });
      }
    }
    // Deduplicate by text+area (keep unique entries)
    const seen = new Set<string>();
    const unique: typeof entries = [];
    for (const e of entries) {
      const key = `${e.text}|${e.area.toFixed(6)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(e);
    }
    return unique.sort((a, b) => a.area - b.area);
  }, [scenes]);

  const excludedCount = textEntries.filter((e) => e.area < bboxThreshold).length;
  const remainingCount = textEntries.length - excludedCount;

  // Max area for scale
  const maxArea = textEntries.length > 0 ? Math.max(...textEntries.map((e) => e.area)) : 0.1;
  const scaleMax = Math.min(maxArea * 1.1, 1);

  // Threshold position as percentage
  const thresholdPct = (bboxThreshold / scaleMax) * 100;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">テキスト検出 面積フィルタ設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 flex-shrink-0">閾値:</label>
            <input
              type="range"
              min={0}
              max={scaleMax}
              step={0.001}
              value={bboxThreshold}
              onChange={(e) => setBboxThreshold(Number(e.target.value))}
              className="flex-1 h-1.5 accent-blue-600"
            />
            <span className="text-xs font-mono text-gray-700 w-14 text-right">{bboxThreshold.toFixed(3)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setBboxThreshold(p.value)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  Math.abs(bboxThreshold - p.value) < 0.0001
                    ? "bg-blue-100 text-blue-700 border-blue-300"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {p.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-gray-400">
              除外: <span className="text-red-600 font-medium">{excludedCount}</span>件
              {" / "}残: <span className="text-green-600 font-medium">{remainingCount}</span>件
              {" / "}全: {textEntries.length}件
            </span>
          </div>
        </div>

        {/* Distribution chart */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          {textEntries.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">テキスト検出データなし</p>
          ) : (
            <div className="space-y-0.5">
              {textEntries.map((entry, i) => {
                const widthPct = (entry.area / scaleMax) * 100;
                const isExcluded = entry.area < bboxThreshold;
                const isSelected = selectedText === `${i}`;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedText(isSelected ? null : `${i}`)}
                    className={`w-full flex items-center gap-2 px-1 py-0.5 rounded text-left transition-colors ${
                      isSelected ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex-1 h-3 bg-gray-100 rounded-sm relative overflow-hidden">
                      {/* Threshold line */}
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
                        style={{ left: `${thresholdPct}%` }}
                      />
                      {/* Bar */}
                      <div
                        className={`h-full rounded-sm transition-colors ${
                          isExcluded ? "bg-red-300" : "bg-green-400"
                        }`}
                        style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                      />
                    </div>
                    <span className={`text-[9px] font-mono w-12 text-right flex-shrink-0 ${
                      isExcluded ? "text-red-400" : "text-gray-400"
                    }`}>
                      {entry.area.toFixed(4)}
                    </span>
                    <span className={`text-[10px] truncate max-w-[180px] ${
                      isExcluded ? "text-red-400 line-through" : "text-gray-600"
                    }`}>
                      {entry.text}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected text detail */}
        {selectedText !== null && textEntries[Number(selectedText)] && (
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                シーン #{textEntries[Number(selectedText)].sceneIndex + 1}
              </span>
              <p className="text-xs text-gray-700 break-all">
                {textEntries[Number(selectedText)].text}
              </p>
              <span className="text-[10px] font-mono text-gray-400 flex-shrink-0 ml-auto">
                面積: {textEntries[Number(selectedText)].area.toFixed(6)}
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
