"use client";

import { useState, useMemo } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { deduplicateDetectedText, detectPersistentText, compareTelopSpeech } from "@/lib/utils";
import type { MatchResult } from "@/lib/utils";
import type { Scene } from "@/types/scene";

interface CurrentSceneTelopProps {
  currentScene: Scene | null;
}

export function CurrentSceneTelop({ currentScene }: CurrentSceneTelopProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const telopOverrides = useProjectStore((s) => s.telopOverrides);
  const setTelopOverride = useProjectStore((s) => s.setTelopOverride);
  const clearTelopOverride = useProjectStore((s) => s.clearTelopOverride);
  const hiddenTelops = useProjectStore((s) => s.hiddenTelops);
  const setHiddenTelop = useProjectStore((s) => s.setHiddenTelop);
  const clearHiddenTelop = useProjectStore((s) => s.clearHiddenTelop);
  const bulkHideTelops = useProjectStore((s) => s.bulkHideTelops);
  const bboxThreshold = useProjectStore((s) => s.bboxThreshold);

  const [hiddenListOpen, setHiddenListOpen] = useState(false);

  const isHidden = (text: string) => hiddenTelops.has(text.replace(/[\s\u3000]/g, ""));

  // Detect persistent text across all scenes
  const persistentTexts = useMemo(() => detectPersistentText(scenes), [scenes]);
  const unhiddenPersistent = persistentTexts.filter((t) => !hiddenTelops.has(t));

  // Speech text for current scene (also displayed for debugging)
  const speech = currentScene?.geminiTranscription?.fullTranscript || "";

  // 前後シーンの音声も結合して照合（タイムスタンプズレ対策）
  const combinedSpeech = useMemo(() => {
    if (!currentScene) return "";
    const prev = currentScene.index > 0 ? scenes[currentScene.index - 1] : null;
    const next = currentScene.index < scenes.length - 1 ? scenes[currentScene.index + 1] : null;
    return [
      prev?.geminiTranscription?.fullTranscript || "",
      speech,
      next?.geminiTranscription?.fullTranscript || "",
    ].join("");
  }, [currentScene, scenes, speech]);

  // Current scene telop matches
  const sceneMatches = useMemo(() => {
    if (!currentScene) return [];
    const dedupedTexts = deduplicateDetectedText(currentScene.viData.detectedText, bboxThreshold)
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    if (dedupedTexts.length === 0) return [];
    return dedupedTexts
      .filter((dt) => !isHidden(dt.text))
      .map((dt) => {
        const key = `${currentScene.index}-${dt.text}`;
        const override = telopOverrides.get(key);
        const auto = combinedSpeech ? compareTelopSpeech(dt.text, combinedSpeech, speech) : ("mismatch" as MatchResult);
        return {
          key,
          telopText: dt.text,
          result: override || auto,
          isOverridden: !!override,
        };
      });
  }, [currentScene, telopOverrides, hiddenTelops, combinedSpeech]);

  const handleOverride = (key: string, result: MatchResult) => {
    const current = telopOverrides.get(key);
    if (current === result) {
      clearTelopOverride(key);
    } else {
      setTelopOverride(key, result);
    }
  };

  const handleBulkCheck = () => {
    for (const match of sceneMatches) {
      setTelopOverride(match.key, "match");
    }
  };

  const resultIcon = (r: MatchResult) => (r === "match" ? "\u2713" : r === "partial" ? "?" : "\u2717");
  const resultColor = (r: MatchResult) =>
    r === "match" ? "text-green-600" : r === "partial" ? "text-yellow-600" : "text-red-600";
  const resultBg = (r: MatchResult) =>
    r === "match" ? "hover:bg-green-50 border-l-green-400" : r === "partial" ? "hover:bg-yellow-50 border-l-yellow-400" : "hover:bg-red-50 border-l-red-400";

  if (!currentScene) {
    return <p className="text-xs text-gray-400 py-2 text-center">シーンを選択してください</p>;
  }

  return (
    <div className="space-y-2">
      {/* Persistent text auto-hide suggestion */}
      {unhiddenPersistent.length > 0 && (
        <div className="pb-2 border-b border-gray-200">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-orange-600 font-medium">
              共通テロップ {unhiddenPersistent.length}件
            </span>
            <button
              onClick={() => bulkHideTelops(unhiddenPersistent)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
            >
              全て非表示
            </button>
          </div>
          <div className="space-y-0.5 max-h-[60px] overflow-y-auto">
            {unhiddenPersistent.slice(0, 3).map((t) => (
              <div key={t} className="flex items-center gap-1 text-[10px] text-gray-500">
                <button
                  onClick={() => setHiddenTelop(t)}
                  className="text-gray-400 hover:text-red-500"
                  title="非表示にする"
                >
                  &#x2715;
                </button>
                <span className="truncate">{t}</span>
              </div>
            ))}
            {unhiddenPersistent.length > 3 && (
              <span className="text-[9px] text-gray-400">他 {unhiddenPersistent.length - 3}件</span>
            )}
          </div>
        </div>
      )}

      {/* Current scene telop comparison */}
      {sceneMatches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
              シーン {currentScene.index + 1} テロップ照合
            </p>
            <button
              onClick={handleBulkCheck}
              className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
            >
              全て&#x2713;
            </button>
          </div>
          {speech && (
            <p className="text-[9px] text-gray-300 truncate mb-1" title={speech}>
              音声: {speech.slice(0, 50)}{speech.length > 50 ? "..." : ""}
            </p>
          )}
          <div className="space-y-1">
            {sceneMatches.map((match) => (
              <div
                key={match.key}
                className={`p-1.5 rounded border-l-2 bg-white ${resultBg(match.result)}`}
              >
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-bold ${resultColor(match.result)}`}>
                    {resultIcon(match.result)}
                  </span>
                  <span className="text-[11px] text-gray-700 truncate flex-1">{match.telopText}</span>
                  {match.isOverridden && (
                    <span className="text-[9px] px-1 py-0.5 bg-purple-100 text-purple-600 rounded">手動</span>
                  )}
                  <div className="flex gap-0.5 ml-auto flex-shrink-0">
                    <button
                      onClick={() => setHiddenTelop(match.telopText)}
                      className="w-5 h-5 rounded text-[10px] font-bold bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                      title="非表示にする"
                    >
                      &#x2212;
                    </button>
                    <button
                      onClick={() => handleOverride(match.key, "match")}
                      className={`w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                        match.result === "match" && match.isOverridden
                          ? "bg-green-500 text-white"
                          : "bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600"
                      }`}
                      title="一致に設定"
                    >
                      {"\u2713"}
                    </button>
                    <button
                      onClick={() => handleOverride(match.key, "mismatch")}
                      className={`w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                        match.result === "mismatch" && match.isOverridden
                          ? "bg-red-500 text-white"
                          : "bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600"
                      }`}
                      title="不一致に設定"
                    >
                      {"\u2717"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sceneMatches.length === 0 && (
        <p className="text-xs text-gray-400 py-2 text-center">テロップなし</p>
      )}

      {/* Hidden telops list (collapsible) */}
      {hiddenTelops.size > 0 && (
        <div className="border-t border-gray-200 pt-2">
          <button
            onClick={() => setHiddenListOpen(!hiddenListOpen)}
            className="w-full flex items-center gap-1 text-[10px] font-medium text-gray-400 tracking-wide hover:text-gray-600"
          >
            <span className="transition-transform" style={{ transform: hiddenListOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
              &#x25B6;
            </span>
            非表示テロップ ({hiddenTelops.size})
          </button>
          {hiddenListOpen && (
            <div className="mt-1 space-y-0.5 max-h-[100px] overflow-y-auto">
              {[...hiddenTelops].map((t) => (
                <div key={t} className="flex items-center gap-1 text-[10px] text-gray-400 px-1">
                  <button
                    onClick={() => clearHiddenTelop(t)}
                    className="text-gray-300 hover:text-green-500 flex-shrink-0"
                    title="復元する"
                  >
                    &#x21A9;
                  </button>
                  <span className="truncate">{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
