"use client";

import { useState } from "react";
import type { Scene } from "@/types/scene";
import { formatTime, SEVERITY_LABELS, CATEGORY_LABELS } from "@/lib/utils";

interface SceneDetailPanelProps {
  scene: Scene | null;
  onTimestampClick?: (time: number) => void;
}

type Tab = "text" | "speech" | "labels" | "objects" | "persons" | "faces" | "logos" | "issues";

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
    { key: "labels", label: "ラベル", count: scene.viData.labels.length },
    { key: "objects", label: "物体", count: scene.viData.objects.length },
    { key: "persons", label: "人物", count: scene.viData.persons.length },
    { key: "faces", label: "顔", count: scene.viData.faces.length },
    { key: "logos", label: "ロゴ", count: scene.viData.logos.length },
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
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-0.5 text-[10px] opacity-60">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
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

        {activeTab === "objects" && (
          <div className="space-y-1">
            {scene.viData.objects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">物体なし</p>
            ) : (
              scene.viData.objects.map((obj, i) => (
                <button
                  key={i}
                  onClick={() => onTimestampClick?.(obj.startTimeSeconds)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatTime(obj.startTimeSeconds)}
                  </span>
                  <span className="text-sm text-gray-800">{obj.description}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {(obj.confidence * 100).toFixed(0)}%
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === "persons" && (
          <div className="space-y-1">
            {scene.viData.persons.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">人物なし</p>
            ) : (
              scene.viData.persons.map((person, i) => (
                <button
                  key={i}
                  onClick={() => onTimestampClick?.(person.startTimeSeconds)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {formatTime(person.startTimeSeconds)} ~ {formatTime(person.endTimeSeconds)}
                    </span>
                    <span className="text-sm text-gray-800">人物 {i + 1}</span>
                  </div>
                  {person.landmarks.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {person.landmarks.slice(0, 5).map((lm, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                          {lm.name}
                        </span>
                      ))}
                      {person.landmarks.length > 5 && (
                        <span className="text-[10px] text-gray-400">+{person.landmarks.length - 5}</span>
                      )}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === "faces" && (
          <div className="space-y-1">
            {scene.viData.faces.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">顔なし</p>
            ) : (
              scene.viData.faces.map((face, i) => (
                <button
                  key={i}
                  onClick={() => onTimestampClick?.(face.startTimeSeconds)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {formatTime(face.startTimeSeconds)}
                    </span>
                    <span className="text-sm text-gray-800">顔 {i + 1}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {(face.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {face.attributes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {face.attributes.map((attr, j) => (
                        <span
                          key={j}
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            attr.confidence > 0.5 ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-400"
                          }`}
                        >
                          {attr.name === "looking_at_camera" ? "カメラ目線" :
                           attr.name === "smiling" ? "笑顔" :
                           attr.name === "mouth_open" ? "口開" :
                           attr.name === "headwear" ? "帽子" :
                           attr.name === "glasses" ? "メガネ" :
                           attr.name}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === "logos" && (
          <div className="space-y-1">
            {scene.viData.logos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">ロゴなし</p>
            ) : (
              scene.viData.logos.map((logo, i) => (
                <button
                  key={i}
                  onClick={() => onTimestampClick?.(logo.startTimeSeconds)}
                  className="w-full text-left p-2 rounded hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {formatTime(logo.startTimeSeconds)}
                  </span>
                  <span className="text-sm text-gray-800">{logo.description}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {(logo.confidence * 100).toFixed(0)}%
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
