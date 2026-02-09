"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Scene } from "@/types/scene";
import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime, SEVERITY_LABELS, CATEGORY_LABELS, groupWordsIntoSentences } from "@/lib/utils";

interface SceneDetailPanelProps {
  scene: Scene | null;
  currentTime?: number;
  onTimestampClick?: (time: number) => void;
}

type Tab = "text" | "speech" | "labels" | "objects" | "persons" | "faces" | "logos" | "issues";

const LANG_LABELS: Record<string, string> = {
  ja: "日本語", en: "英語", zh: "中国語", ko: "韓国語", ar: "アラビア語",
  es: "スペイン語", fr: "フランス語", de: "ドイツ語", pt: "ポルトガル語",
  hi: "ヒンディー語", th: "タイ語", vi: "ベトナム語", id: "インドネシア語",
};

export function SceneDetailPanel({ scene, currentTime = 0, onTimestampClick }: SceneDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("issues");
  const [showTranslation, setShowTranslation] = useState(false);
  const activeSentenceRef = useRef<HTMLDivElement>(null);
  const analysisStatus = useProjectStore((s) => s.analysisStatus);

  const speechSource = scene?.geminiTranscription?.words?.length ? "gemini" : "vi";
  const isTranscribing = speechSource === "vi" && analysisStatus === "importing_transcribe";
  const hasTranslation = !!(scene?.geminiTranscription?.translatedWords?.length);
  const detectedLang = scene?.geminiTranscription?.detectedLanguage;

  const sentences = useMemo(
    () => {
      if (!scene) return [];
      const words = scene.geminiTranscription?.words?.length
        ? scene.geminiTranscription.words
        : scene.viData.speechTranscription;
      return groupWordsIntoSentences(words);
    },
    [scene]
  );

  const translatedSentences = useMemo(
    () => {
      if (!scene?.geminiTranscription?.translatedWords?.length) return [];
      return groupWordsIntoSentences(scene.geminiTranscription.translatedWords);
    },
    [scene]
  );

  // Auto-scroll to active sentence in speech tab
  useEffect(() => {
    if (activeTab === "speech" && activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentTime, activeTab]);

  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
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
    <div className="flex flex-col h-full">
      {/* Sticky header + tabs */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        {/* Header */}
        <div className="px-3 py-2 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 text-sm">
            シーン {scene.index + 1}
            <span className="text-gray-400 text-xs ml-2">
              {formatTime(scene.startTimeSeconds)} ~ {formatTime(scene.endTimeSeconds)}
            </span>
          </h3>
          {scene.geminiAnalysis && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
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
          <p className="text-xs text-gray-500 px-3 pb-2 -mt-1">{scene.geminiAnalysis.summary}</p>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto border-t border-gray-100">
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
      </div>

      {/* Scrollable tab content */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
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
          <div className="space-y-3">
            {/* Gemini text summary */}
            {scene.geminiAnalysis?.detectedTextSummary && (
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <h4 className="text-xs font-medium text-orange-700 mb-1">テキスト要約</h4>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {scene.geminiAnalysis.detectedTextSummary}
                </p>
              </div>
            )}

            {/* VI OCR raw results */}
            {scene.viData.detectedText.length === 0 && !scene.geminiAnalysis?.detectedTextSummary ? (
              <p className="text-sm text-gray-400 text-center py-4">テキストなし</p>
            ) : scene.viData.detectedText.length > 0 ? (
              <>
                {scene.geminiAnalysis?.detectedTextSummary && (
                  <h4 className="text-xs font-medium text-gray-400 px-2">OCR検出結果</h4>
                )}
                <div className="space-y-1">
                  {scene.viData.detectedText.map((t, i) => (
                    <button
                      key={i}
                      onClick={() => onTimestampClick?.(t.startTimeSeconds)}
                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-800">「{t.text}」</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}

        {activeTab === "speech" && (
          <div className="space-y-3">
            {/* Language badge + translation toggle */}
            {(detectedLang || hasTranslation) && (
              <div className="flex items-center gap-2 px-2">
                {detectedLang && detectedLang !== "unknown" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                    {LANG_LABELS[detectedLang] || detectedLang}
                  </span>
                )}
                {hasTranslation && (
                  <button
                    onClick={() => setShowTranslation(!showTranslation)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
                      showTranslation
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {showTranslation ? "翻訳ON" : "翻訳OFF"}
                  </button>
                )}
              </div>
            )}

            {/* Gemini transcription in progress indicator */}
            {isTranscribing && (
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200">
                <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                <span className="text-xs text-purple-700 font-medium">
                  Gemini高品質文字起こし中... 完了次第自動更新
                </span>
              </div>
            )}

            {/* Gemini speech summary */}
            {scene.geminiAnalysis?.speechSummary && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <h4 className="text-xs font-medium text-purple-700 mb-1">音声文字起こし（Gemini）</h4>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {scene.geminiAnalysis.speechSummary}
                </p>
              </div>
            )}

            {/* Translated transcript summary */}
            {showTranslation && scene.geminiTranscription?.translatedTranscript && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <h4 className="text-xs font-medium text-green-700 mb-1">日本語翻訳</h4>
                <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
                  {scene.geminiTranscription.translatedTranscript}
                </p>
              </div>
            )}

            {/* Word-level speech (Gemini or VI API) */}
            {sentences.length === 0 && !scene.viData.fullTranscript && !scene.geminiAnalysis?.speechSummary ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">
                  このシーン（{formatTime(scene.startTimeSeconds)}〜{formatTime(scene.endTimeSeconds)}）に音声データはありません
                </p>
                {isTranscribing && (
                  <p className="text-xs text-purple-500 mt-1">Gemini文字起こし完了後に表示される可能性があります</p>
                )}
              </div>
            ) : sentences.length > 0 ? (
              <>
              <h4 className="text-xs font-medium text-gray-400 px-2">
                ワードレベル（{speechSource === "gemini" ? "Gemini" : "VI API"}）
              </h4>
              {sentences.map((sentence, si) => {
                const isActiveSentence =
                  currentTime >= sentence.startTimeSeconds && currentTime < sentence.endTimeSeconds;

                return (
                  <div key={si}>
                    <p
                      ref={isActiveSentence ? activeSentenceRef : undefined}
                      className={`rounded px-3 py-1.5 text-sm leading-relaxed transition-colors ${
                        isActiveSentence
                          ? "border-2 border-blue-500 bg-blue-50"
                          : "border-2 border-transparent"
                      }`}
                    >
                      {sentence.words.map((w, wi) => {
                        const isActiveWord =
                          currentTime >= w.startTimeSeconds &&
                          currentTime < w.endTimeSeconds;
                        return (
                          <span
                            key={wi}
                            onClick={() => onTimestampClick?.(w.startTimeSeconds)}
                            className={`cursor-pointer hover:bg-blue-100 ${
                              isActiveWord
                                ? "border-b-[3px] border-red-500 text-gray-900"
                                : "text-gray-700"
                            }`}
                          >
                            {w.word}
                          </span>
                        );
                      })}
                    </p>
                    {/* Inline translation for this sentence */}
                    {showTranslation && translatedSentences[si] && (
                      <p className="px-3 py-1 text-xs text-green-700 bg-green-50/50 rounded">
                        {translatedSentences[si].words.map((w, wi) => {
                          const isActiveWord =
                            currentTime >= w.startTimeSeconds &&
                            currentTime < w.endTimeSeconds;
                          return (
                            <span
                              key={wi}
                              onClick={() => onTimestampClick?.(w.startTimeSeconds)}
                              className={`cursor-pointer hover:bg-green-100 ${
                                isActiveWord ? "border-b-2 border-green-500 font-medium" : ""
                              }`}
                            >
                              {w.word}
                            </span>
                          );
                        })}
                      </p>
                    )}
                  </div>
                );
              })}
              </>
            ) : scene.viData.fullTranscript && !scene.geminiAnalysis?.speechSummary ? (
              <p className="text-sm text-gray-800 leading-relaxed">{scene.viData.fullTranscript}</p>
            ) : null}
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
