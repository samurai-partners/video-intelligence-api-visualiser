"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Scene } from "@/types/scene";
import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime, groupWordsIntoSentences } from "@/lib/utils";

const LANG_LABELS: Record<string, string> = {
  ja: "日本語", en: "英語", zh: "中国語", ko: "韓国語", ar: "アラビア語",
  es: "スペイン語", fr: "フランス語", de: "ドイツ語", pt: "ポルトガル語",
  hi: "ヒンディー語", th: "タイ語", vi: "ベトナム語", id: "インドネシア語",
};

interface SpeechPanelProps {
  scene: Scene | null;
  currentTime?: number;
  onTimestampClick?: (time: number) => void;
}

export function SpeechPanel({ scene, currentTime = 0, onTimestampClick }: SpeechPanelProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const activeSentenceRef = useRef<HTMLDivElement>(null);
  const analysisStatus = useProjectStore((s) => s.analysisStatus);

  const speechSource = scene?.geminiTranscription?.words?.length ? "gemini" : "vi";
  const isTranscribing = speechSource === "vi" && analysisStatus === "importing_transcribe";
  const hasTranslation = !!(scene?.geminiTranscription?.translatedWords?.length);
  const detectedLang = scene?.geminiTranscription?.detectedLanguage;

  const sentences = useMemo(() => {
    if (!scene) return [];
    const words = scene.geminiTranscription?.words?.length
      ? scene.geminiTranscription.words
      : scene.viData.speechTranscription;
    return groupWordsIntoSentences(words);
  }, [scene]);

  const translatedSentences = useMemo(() => {
    if (!scene?.geminiTranscription?.translatedWords?.length) return [];
    return groupWordsIntoSentences(scene.geminiTranscription.translatedWords);
  }, [scene]);

  useEffect(() => {
    if (activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentTime]);

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
          <h3 className="text-xs font-semibold text-gray-700">
            音声
            {speechSource === "gemini" && (
              <span className="ml-1 text-[10px] text-purple-500 font-normal">(Gemini)</span>
            )}
          </h3>
          <div className="flex items-center gap-1.5">
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
        </div>

        {isTranscribing && (
          <div className="flex items-center gap-1.5 py-1">
            <span className="inline-block w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-[10px] text-purple-700 font-medium">
              Gemini文字起こし中...
            </span>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-2 space-y-2">
        {/* Gemini speech summary */}
        {scene.geminiAnalysis?.speechSummary && (
          <div className="p-2 bg-purple-50 rounded border border-purple-200">
            <p className="text-[11px] text-gray-800 leading-relaxed">
              {scene.geminiAnalysis.speechSummary}
            </p>
          </div>
        )}

        {/* Translated transcript summary */}
        {showTranslation && scene.geminiTranscription?.translatedTranscript && (
          <div className="p-2 bg-green-50 rounded border border-green-200">
            <p className="text-[11px] text-gray-800 leading-relaxed">
              {scene.geminiTranscription.translatedTranscript}
            </p>
          </div>
        )}

        {/* Word-level speech */}
        {sentences.length === 0 && !scene.viData.fullTranscript && !scene.geminiAnalysis?.speechSummary ? (
          <div className="text-center py-4">
            <p className="text-[11px] text-gray-400">
              {formatTime(scene.startTimeSeconds)}〜{formatTime(scene.endTimeSeconds)} に音声なし
            </p>
            {isTranscribing && (
              <p className="text-[10px] text-purple-500 mt-1">完了後に表示される可能性があります</p>
            )}
          </div>
        ) : sentences.length > 0 ? (
          <div className="space-y-1">
            {sentences.map((sentence, si) => {
              const isActiveSentence =
                currentTime >= (sentence.startTimeSeconds - 0.15) && currentTime < sentence.endTimeSeconds;

              return (
                <div key={si}>
                  <p
                    ref={isActiveSentence ? activeSentenceRef : undefined}
                    className={`rounded px-2 py-1 text-[12px] leading-relaxed transition-colors ${
                      isActiveSentence
                        ? "border-2 border-blue-500 bg-blue-50"
                        : "border-2 border-transparent"
                    }`}
                  >
                    {sentence.words.map((w, wi) => {
                      const TOLERANCE = 0.15;
                      const isActiveWord =
                        currentTime >= (w.startTimeSeconds - TOLERANCE) && currentTime < w.endTimeSeconds;
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
                  {showTranslation && translatedSentences[si] && (
                    <p className="px-2 py-0.5 text-[10px] text-green-700 bg-green-50/50 rounded">
                      {translatedSentences[si].words.map((w, wi) => {
                        const isActiveWord =
                          currentTime >= (w.startTimeSeconds - 0.15) && currentTime < w.endTimeSeconds;
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
          </div>
        ) : scene.viData.fullTranscript && !scene.geminiAnalysis?.speechSummary ? (
          <p className="text-[12px] text-gray-800 leading-relaxed">{scene.viData.fullTranscript}</p>
        ) : null}
      </div>
    </div>
  );
}
