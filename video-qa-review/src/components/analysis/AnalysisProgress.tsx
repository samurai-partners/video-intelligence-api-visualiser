"use client";

import type { AnalysisStatus } from "@/types/project";

interface AnalysisProgressProps {
  status: AnalysisStatus;
}

const STEPS: { key: AnalysisStatus; label: string }[] = [
  { key: "uploading", label: "動画アップロード中..." },
  { key: "analyzing_vi", label: "テロップ・音声を読み取り中..." },
  { key: "segmenting", label: "シーンに分割中..." },
  { key: "analyzing_gemini", label: "AIが内容をチェック中..." },
  { key: "completed", label: "完了" },
];

export function AnalysisProgress({ status }: AnalysisProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="space-y-3">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isPending = i > currentIndex;

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0
                ${isDone ? "bg-green-100 text-green-600" : ""}
                ${isCurrent ? "bg-blue-100 text-blue-600 animate-pulse" : ""}
                ${isPending ? "bg-gray-100 text-gray-400" : ""}
              `}
            >
              {isDone ? "✓" : i + 1}
            </div>
            <span
              className={`text-sm ${
                isDone ? "text-green-600" : isCurrent ? "text-blue-600 font-medium" : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
