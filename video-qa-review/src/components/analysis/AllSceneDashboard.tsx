"use client";

import { useState, useMemo } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { IssueCard } from "./IssueCard";
import { formatTime, deduplicateDetectedText, compareTelopSpeech } from "@/lib/utils";
import type { MatchResult } from "@/lib/utils";

interface AllSceneDashboardProps {
  onSceneClick?: (sceneIndex: number) => void;
  onIssueClick?: (timestampSeconds: number) => void;
}

export function AllSceneDashboard({ onSceneClick, onIssueClick }: AllSceneDashboardProps) {
  const issues = useProjectStore((s) => s.issues);
  const scenes = useProjectStore((s) => s.scenes);
  const filterSeverity = useProjectStore((s) => s.filterSeverity);
  const toggleSeverityFilter = useProjectStore((s) => s.toggleSeverityFilter);
  const analysisStatus = useProjectStore((s) => s.analysisStatus);
  const telopOverrides = useProjectStore((s) => s.telopOverrides);
  const hiddenTelops = useProjectStore((s) => s.hiddenTelops);
  const bulkSetTelopOverrides = useProjectStore((s) => s.bulkSetTelopOverrides);
  const bboxThreshold = useProjectStore((s) => s.bboxThreshold);

  // Active filter tab: null = show issues, or a MatchResult to show scene chips
  const [activeTab, setActiveTab] = useState<MatchResult | null>(null);

  const isHidden = (text: string) => hiddenTelops.has(text.replace(/[\s\u3000]/g, ""));

  const filteredIssues = issues.filter((i) => filterSeverity.has(i.severity));
  const countBySeverity = (severity: string) => issues.filter((i) => i.severity === severity).length;

  // All-scenes telop matches + summary counts (single pass)
  const { allMatches, summaryCounts } = useMemo(() => {
    const matches: Array<{
      key: string;
      sceneIndex: number;
      startTimeSeconds: number;
      telopText: string;
      result: MatchResult;
      isOverridden: boolean;
    }> = [];
    let matchCount = 0, partialCount = 0, mismatchCount = 0;

    for (let si = 0; si < scenes.length; si++) {
      const s = scenes[si];
      if (s.viData.detectedText.length === 0) continue;
      const sSpeech = s.geminiTranscription?.fullTranscript || "";
      if (!sSpeech) continue;
      // 前後シーンの音声も結合（タイムスタンプズレ対策）
      const prev = si > 0 ? scenes[si - 1]?.geminiTranscription?.fullTranscript || "" : "";
      const next = si < scenes.length - 1 ? scenes[si + 1]?.geminiTranscription?.fullTranscript || "" : "";
      const combined = prev + sSpeech + next;
      const deduped = deduplicateDetectedText(s.viData.detectedText, bboxThreshold);
      for (const dt of deduped) {
        if (isHidden(dt.text)) continue;
        const key = `${s.index}-${dt.text}`;
        const override = telopOverrides.get(key);
        const auto = compareTelopSpeech(dt.text, combined, sSpeech);
        const result = override || auto;
        matches.push({
          key,
          sceneIndex: s.index,
          startTimeSeconds: s.startTimeSeconds,
          telopText: dt.text,
          result,
          isOverridden: !!override,
        });
        if (result === "match") matchCount++;
        else if (result === "partial") partialCount++;
        else mismatchCount++;
      }
    }
    return {
      allMatches: matches,
      summaryCounts: { match: matchCount, partial: partialCount, mismatch: mismatchCount },
    };
  }, [scenes, telopOverrides, hiddenTelops, bboxThreshold]);

  // Group scenes by match result for chip display
  const scenesByResult = useMemo(() => {
    const map: Record<MatchResult, Set<number>> = { match: new Set(), partial: new Set(), mismatch: new Set() };
    for (const m of allMatches) {
      map[m.result].add(m.sceneIndex);
    }
    return map;
  }, [allMatches]);

  // Auto-check: set all matches to "match" override
  const handleAutoCheckMatches = () => {
    const entries = allMatches
      .filter((m) => m.result === "match" && !m.isOverridden)
      .map((m) => ({ key: m.key, result: "match" as MatchResult }));
    if (entries.length > 0) bulkSetTelopOverrides(entries);
  };

  const handleTabClick = (tab: MatchResult) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const totalIssues = issues.length;

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-gray-50 flex items-center gap-1.5 flex-wrap">
        {/* Severity filters */}
        {(["critical", "warning", "info"] as const).map((sev) => {
          const count = countBySeverity(sev);
          const active = filterSeverity.has(sev);
          const styles: Record<string, string> = {
            critical: active ? "bg-red-100 text-red-700 border-red-300" : "bg-gray-100 text-gray-400 border-gray-200",
            warning: active ? "bg-yellow-100 text-yellow-700 border-yellow-300" : "bg-gray-100 text-gray-400 border-gray-200",
            info: active ? "bg-blue-100 text-blue-700 border-blue-300" : "bg-gray-100 text-gray-400 border-gray-200",
          };
          const labels: Record<string, string> = { critical: "重大", warning: "警告", info: "情報" };
          return (
            <button
              key={sev}
              onClick={() => { toggleSeverityFilter(sev); setActiveTab(null); }}
              className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${styles[sev]} ${activeTab === null && active ? "ring-1 ring-offset-1 ring-gray-300" : ""}`}
            >
              {labels[sev]} {count}
            </button>
          );
        })}

        <span className="w-px h-4 bg-gray-300 mx-0.5" />

        {/* Telop match filters */}
        {(["match", "partial", "mismatch"] as const).map((r) => {
          const count = summaryCounts[r];
          const isActive = activeTab === r;
          const styles: Record<string, string> = {
            match: isActive ? "bg-green-200 text-green-800 border-green-400 ring-1 ring-offset-1 ring-green-300" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
            partial: isActive ? "bg-yellow-200 text-yellow-800 border-yellow-400 ring-1 ring-offset-1 ring-yellow-300" : "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100",
            mismatch: isActive ? "bg-red-200 text-red-800 border-red-400 ring-1 ring-offset-1 ring-red-300" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
          };
          const labels: Record<string, string> = { match: "一致", partial: "部分", mismatch: "不一致" };
          return (
            <button
              key={r}
              onClick={() => handleTabClick(r)}
              className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${styles[r]}`}
            >
              {labels[r]} {count}
            </button>
          );
        })}

        {/* Auto-check button */}
        {summaryCounts.match > 0 && (
          <button
            onClick={handleAutoCheckMatches}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors ml-auto"
            title="一致を全てチェック済みに"
          >
            一致auto&#x2713;
          </button>
        )}

        {analysisStatus === "importing_transcribe" && (
          <span className="flex items-center gap-1 text-[10px] text-purple-500 ml-auto">
            <span className="inline-block w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse" />
            文字起こし中...
          </span>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-3 py-1.5">
        {activeTab === null ? (
          /* Issue cards view */
          <div className="space-y-1">
            {totalIssues === 0 && scenes.length > 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">問題なし</p>
            ) : filteredIssues.length === 0 ? (
              totalIssues > 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">フィルタに一致する問題なし</p>
              ) : null
            ) : (
              filteredIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onClick={() => onIssueClick?.(issue.timestampSeconds)}
                />
              ))
            )}
          </div>
        ) : (
          /* Scene chips view for selected match type */
          <div>
            <p className="text-[10px] text-gray-500 mb-1.5">
              {activeTab === "match" ? "一致" : activeTab === "partial" ? "部分一致" : "不一致"}のシーン
              （{scenesByResult[activeTab].size}シーン）
              — クリックでジャンプ
            </p>
            <div className="flex flex-wrap gap-1">
              {[...scenesByResult[activeTab]].sort((a, b) => a - b).map((idx) => {
                const scene = scenes[idx];
                if (!scene) return null;
                const chipColor = activeTab === "match"
                  ? "bg-green-100 text-green-700 hover:bg-green-200 border-green-300"
                  : activeTab === "partial"
                  ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-300"
                  : "bg-red-100 text-red-700 hover:bg-red-200 border-red-300";
                return (
                  <button
                    key={idx}
                    onClick={() => onSceneClick?.(idx)}
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-medium transition-colors ${chipColor}`}
                    title={`${formatTime(scene.startTimeSeconds)}`}
                  >
                    #{idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
