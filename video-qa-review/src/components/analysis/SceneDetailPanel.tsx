"use client";

import { useState } from "react";
import type { Scene } from "@/types/scene";
import { formatTime, SEVERITY_LABELS, CATEGORY_LABELS } from "@/lib/utils";

interface SceneDetailPanelProps {
  scene: Scene | null;
  onTimestampClick?: (time: number) => void;
}

type Tab = "text" | "speech" | "labels" | "issues";

export function SceneDetailPanel({ scene, onTimestampClick }: SceneDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("issues");

  if (!scene) {
    return (
      <div className="rounded-lg border border-gray-200 p-8 text-center text-gray-400">
        シーンを選択してください
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "issues", label: "問題", count: scene.geminiAnalysis?.issues.length || 0 },
    { key: "text", label: "テキスト", count: scene.viData.detectedText.length },
    { key: "speech", label: "音声", count: scene.viData.speechTranscription.length > 0 ? 1 : 0 },
    { key: "labels", label: "映像ラベル", count: scene.viData.labels.length },
  ];

  return (
    <div className="rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">
            シーン {scene.index + 1}
            <span className="text-gray-400 text-sm ml-2">
              {formatTime(scene.startTimeSeconds)} ~ {formatTime(scene.endTimeSeconds)}
            </span>
          </h3>
          {scene.geminiAnalysis && (
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                scene.geminiAnalysis.overallRisk === "high"
                  ? "bg-red-100 text-red-700"
                  : scene.geminiAnalysis.overallRisk === "medium"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {scene.geminiAnalysis.overallRisk === "high"
                ? "高リスク"
                : scene.geminiAnalysis.overallRisk === "medium"
                ? "中リスク"
                : "低リスク"}
            </span>
          )}
        </div>
        {scene.geminiAnalysis?.summary && (
          <p className="text-sm text-gray-600 mt-1">{scene.geminiAnalysis.summary}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-xs opacity-60">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-[300px] overflow-y-auto">
        {activeTab === "issues" && (
          <div className="space-y-2">
            {(scene.geminiAnalysis?.issues || []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">問題なし</p>
            ) : (
              scene.geminiAnalysis?.issues.map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => onTimestampClick?.(issue.timestamp)}
                  className="w-full text-left p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        issue.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : issue.severity === "warning"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {SEVERITY_LABELS[issue.severity] || issue.severity}
                    </span>
                    <span className="text-xs text-gray-400">
                      {CATEGORY_LABELS[issue.category] || issue.category}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {formatTime(issue.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="text-xs text-gray-500 mt-1">→ {issue.suggestion}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === "text" && (
          <div className="space-y-2">
            {scene.viData.detectedText.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">テキストなし</p>
            ) : (
              scene.viData.detectedText.map((t, i) => (
                <button
                  key={i}
                  onClick={() => onTimestampClick?.(t.startTimeSeconds)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 transition-colors"
                >
                  <span className="text-xs text-gray-400 mr-2">
                    {formatTime(t.startTimeSeconds)}
                  </span>
                  <span className="text-sm text-gray-800">「{t.text}」</span>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === "speech" && (
          <div>
            {scene.viData.fullTranscript ? (
              <p className="text-sm text-gray-800 leading-relaxed">{scene.viData.fullTranscript}</p>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">音声なし</p>
            )}
          </div>
        )}

        {activeTab === "labels" && (
          <div className="flex flex-wrap gap-2">
            {scene.viData.labels.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4 w-full">ラベルなし</p>
            ) : (
              scene.viData.labels.map((l, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full bg-gray-100 text-sm text-gray-700"
                >
                  {l.description}
                  <span className="text-gray-400 ml-1 text-xs">
                    {(l.confidence * 100).toFixed(0)}%
                  </span>
                </span>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
