"use client";

import { useState, useMemo } from "react";
import { useProjectStore, type MatchResult } from "@/stores/useProjectStore";
import { IssueCard } from "./IssueCard";
import { formatTime, deduplicateDetectedText, detectPersistentText } from "@/lib/utils";
import type { Scene } from "@/types/scene";

interface IssueListProps {
  onIssueClick?: (timestampSeconds: number) => void;
  currentScene?: Scene | null;
}

function compareTelopSpeech(telop: string, speech: string): MatchResult {
  const t = telop.replace(/[\s\u3000]/g, "");
  const s = speech.replace(/[\s\u3000]/g, "");
  if (!t || !s) return "mismatch";
  if (s.includes(t) || t.includes(s)) return "match";
  const tChars = new Set([...t]);
  const overlap = [...tChars].filter((c) => s.includes(c)).length;
  if (overlap / tChars.size > 0.5) return "partial";
  return "mismatch";
}

export function IssueList({ onIssueClick, currentScene }: IssueListProps) {
  const issues = useProjectStore((s) => s.issues);
  const scenes = useProjectStore((s) => s.scenes);
  const filterSeverity = useProjectStore((s) => s.filterSeverity);
  const toggleSeverityFilter = useProjectStore((s) => s.toggleSeverityFilter);
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);
  const analysisStatus = useProjectStore((s) => s.analysisStatus);
  const telopOverrides = useProjectStore((s) => s.telopOverrides);
  const setTelopOverride = useProjectStore((s) => s.setTelopOverride);
  const clearTelopOverride = useProjectStore((s) => s.clearTelopOverride);
  const hiddenTelops = useProjectStore((s) => s.hiddenTelops);
  const setHiddenTelop = useProjectStore((s) => s.setHiddenTelop);
  const clearHiddenTelop = useProjectStore((s) => s.clearHiddenTelop);
  const bulkHideTelops = useProjectStore((s) => s.bulkHideTelops);

  const [allScenesOpen, setAllScenesOpen] = useState(false);
  const [hiddenListOpen, setHiddenListOpen] = useState(false);
  const [filterMatch, setFilterMatch] = useState<Set<MatchResult>>(new Set(["match", "partial", "mismatch"]));

  const filteredIssues = issues.filter((i) => filterSeverity.has(i.severity));

  const countBySeverity = (severity: string) =>
    issues.filter((i) => i.severity === severity).length;

  const isHidden = (text: string) => hiddenTelops.has(text.replace(/[\s\u3000]/g, ""));

  // Detect persistent text across all scenes
  const persistentTexts = useMemo(() => detectPersistentText(scenes), [scenes]);
  const unhiddenPersistent = persistentTexts.filter((t) => !hiddenTelops.has(t));

  // Current scene telop matches (with manual override + hidden filter)
  const sceneMatches = useMemo(() => {
    if (!currentScene) return [];
    const dedupedTexts = deduplicateDetectedText(currentScene.viData.detectedText);
    if (dedupedTexts.length === 0) return [];
    const speech = currentScene.geminiTranscription?.fullTranscript || "";
    return dedupedTexts
      .filter((dt) => !isHidden(dt.text))
      .map((dt) => {
        const key = `${currentScene.index}-${dt.text}`;
        const override = telopOverrides.get(key);
        const auto = speech ? compareTelopSpeech(dt.text, speech) : ("mismatch" as MatchResult);
        return {
          key,
          telopText: dt.text,
          result: override || auto,
          isOverridden: !!override,
        };
      });
  }, [currentScene, telopOverrides, hiddenTelops]);

  // All-scenes telop matches (computed only when section is open)
  const allMatches = useMemo(() => {
    if (!allScenesOpen) return [];
    const results: Array<{
      key: string;
      sceneIndex: number;
      startTimeSeconds: number;
      telopText: string;
      result: MatchResult;
      isOverridden: boolean;
    }> = [];
    for (const s of scenes) {
      if (s.viData.detectedText.length === 0) continue;
      const sSpeech = s.geminiTranscription?.fullTranscript || "";
      if (!sSpeech) continue;
      const deduped = deduplicateDetectedText(s.viData.detectedText);
      for (const dt of deduped) {
        if (isHidden(dt.text)) continue;
        const key = `${s.index}-${dt.text}`;
        const override = telopOverrides.get(key);
        const auto = compareTelopSpeech(dt.text, sSpeech);
        results.push({
          key,
          sceneIndex: s.index,
          startTimeSeconds: s.startTimeSeconds,
          telopText: dt.text,
          result: override || auto,
          isOverridden: !!override,
        });
      }
    }
    return results;
  }, [scenes, telopOverrides, allScenesOpen, hiddenTelops]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    let match = 0, partial = 0, mismatch = 0;
    for (const s of scenes) {
      if (s.viData.detectedText.length === 0) continue;
      const sSpeech = s.geminiTranscription?.fullTranscript || "";
      if (!sSpeech) continue;
      const deduped = deduplicateDetectedText(s.viData.detectedText);
      for (const dt of deduped) {
        if (isHidden(dt.text)) continue;
        const key = `${s.index}-${dt.text}`;
        const override = telopOverrides.get(key);
        const r = override || compareTelopSpeech(dt.text, sSpeech);
        if (r === "match") match++;
        else if (r === "partial") partial++;
        else mismatch++;
      }
    }
    return { match, partial, mismatch };
  }, [scenes, telopOverrides, hiddenTelops]);

  const filteredAll = useMemo(() => {
    const order: Record<MatchResult, number> = { mismatch: 0, partial: 1, match: 2 };
    return allMatches
      .filter((m) => filterMatch.has(m.result))
      .sort((a, b) => order[a.result] - order[b.result]);
  }, [allMatches, filterMatch]);

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

  const toggleFilter = (r: MatchResult) => {
    setFilterMatch((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const resultIcon = (r: MatchResult) => (r === "match" ? "\u2713" : r === "partial" ? "?" : "\u2717");
  const resultColor = (r: MatchResult) =>
    r === "match" ? "text-green-600" : r === "partial" ? "text-yellow-600" : "text-red-600";
  const resultBg = (r: MatchResult) =>
    r === "match" ? "hover:bg-green-50 border-l-green-400" : r === "partial" ? "hover:bg-yellow-50 border-l-yellow-400" : "hover:bg-red-50 border-l-red-400";

  return (
    <div className="space-y-3">
      {/* Issue severity filters */}
      <div className="flex items-center gap-2">
        {(["critical", "warning", "info"] as const).map((sev) => {
          const count = countBySeverity(sev);
          const active = filterSeverity.has(sev);
          const styles: Record<string, string> = {
            critical: active ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-50 text-gray-400 border-gray-200",
            warning: active ? "bg-yellow-100 text-yellow-700 border-yellow-300" : "bg-gray-50 text-gray-400 border-gray-200",
            info: active ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-gray-50 text-gray-400 border-gray-200",
          };
          const labels: Record<string, string> = { critical: "重大", warning: "警告", info: "情報" };
          return (
            <button
              key={sev}
              onClick={() => toggleSeverityFilter(sev)}
              className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${styles[sev]}`}
            >
              {labels[sev]} {count}
            </button>
          );
        })}
      </div>

      {/* Issue list */}
      <div className="space-y-1.5">
        {filteredIssues.length === 0 ? (
          <p className="text-xs text-gray-400 py-2 text-center">問題なし</p>
        ) : (
          <div className="space-y-1.5">
            {filteredIssues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onClick={() => onIssueClick?.(issue.timestampSeconds)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Persistent text auto-hide suggestion */}
      {unhiddenPersistent.length > 0 && (
        <div className="border-t border-gray-200 pt-2">
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
      {sceneMatches.length > 0 && currentScene && (
        <div className="border-t border-gray-200 pt-2">
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

      {/* All scenes telop summary (collapsible) */}
      {(summaryCounts.match > 0 || summaryCounts.partial > 0 || summaryCounts.mismatch > 0) && (
        <div className="border-t border-gray-200 pt-2">
          <button
            onClick={() => setAllScenesOpen(!allScenesOpen)}
            className="w-full flex items-center gap-1 text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5 hover:text-gray-700"
          >
            <span className="transition-transform" style={{ transform: allScenesOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
              &#x25B6;
            </span>
            全シーン照合
          </button>

          {/* Summary badges (always visible) */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="px-2 py-0.5 rounded border text-[10px] font-medium bg-green-100 text-green-700 border-green-300">
              一致 {summaryCounts.match}
            </span>
            <span className="px-2 py-0.5 rounded border text-[10px] font-medium bg-yellow-100 text-yellow-700 border-yellow-300">
              部分 {summaryCounts.partial}
            </span>
            <span className="px-2 py-0.5 rounded border text-[10px] font-medium bg-red-100 text-red-700 border-red-300">
              不一致 {summaryCounts.mismatch}
            </span>
          </div>

          {analysisStatus === "importing_transcribe" && (
            <p className="text-[10px] text-purple-500 flex items-center gap-1 mb-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
              文字起こし進行中...
            </p>
          )}

          {/* Expanded: filter badges + list */}
          {allScenesOpen && (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                {(["match", "partial", "mismatch"] as const).map((r) => {
                  const active = filterMatch.has(r);
                  const styles: Record<string, string> = {
                    match: active ? "bg-green-100 text-green-700 border-green-300" : "bg-gray-50 text-gray-400 border-gray-200",
                    partial: active ? "bg-yellow-100 text-yellow-700 border-yellow-300" : "bg-gray-50 text-gray-400 border-gray-200",
                    mismatch: active ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-50 text-gray-400 border-gray-200",
                  };
                  const labels: Record<string, string> = { match: "一致", partial: "部分", mismatch: "不一致" };
                  return (
                    <button
                      key={r}
                      onClick={() => toggleFilter(r)}
                      className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${styles[r]}`}
                    >
                      {labels[r]}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-0.5 max-h-[250px] overflow-y-auto">
                {filteredAll.map((match, i) => (
                  <button
                    key={`${match.key}-${i}`}
                    onClick={() => {
                      setCurrentSceneIndex(match.sceneIndex);
                      onIssueClick?.(match.startTimeSeconds);
                    }}
                    className={`w-full text-left p-1.5 rounded border-l-2 bg-white transition-colors ${resultBg(match.result)}`}
                  >
                    <div className="flex items-start gap-1">
                      <span className={`text-xs font-bold flex-shrink-0 ${resultColor(match.result)}`}>
                        {resultIcon(match.result)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-400">#{match.sceneIndex + 1}</span>
                          <span className="text-[10px] text-gray-400">{formatTime(match.startTimeSeconds)}</span>
                          {match.isOverridden && (
                            <span className="text-[9px] px-1 bg-purple-100 text-purple-600 rounded">手動</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-700 truncate">{match.telopText}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
