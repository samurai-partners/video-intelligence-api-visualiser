"use client";

import { useMemo } from "react";
import { useProjectStore } from "@/stores/useProjectStore";
import { IssueCard } from "./IssueCard";
import { formatTime } from "@/lib/utils";

interface IssueListProps {
  onIssueClick?: (timestampSeconds: number) => void;
}

type MatchResult = "match" | "partial" | "mismatch";

interface TelopMatch {
  sceneIndex: number;
  startTimeSeconds: number;
  telopText: string;
  speechText: string;
  result: MatchResult;
}

function compareTelopSpeech(telop: string, speech: string): MatchResult {
  const t = telop.replace(/[\s\u3000]/g, "");
  const s = speech.replace(/[\s\u3000]/g, "");
  if (!t || !s) return "mismatch";
  if (s.includes(t) || t.includes(s)) return "match";
  // Check character overlap ratio
  const tChars = new Set([...t]);
  const overlap = [...tChars].filter((c) => s.includes(c)).length;
  if (overlap / tChars.size > 0.5) return "partial";
  return "mismatch";
}

export function IssueList({ onIssueClick }: IssueListProps) {
  const issues = useProjectStore((s) => s.issues);
  const scenes = useProjectStore((s) => s.scenes);
  const filterSeverity = useProjectStore((s) => s.filterSeverity);
  const toggleSeverityFilter = useProjectStore((s) => s.toggleSeverityFilter);
  const setCurrentSceneIndex = useProjectStore((s) => s.setCurrentSceneIndex);

  const filteredIssues = issues.filter((i) => filterSeverity.has(i.severity));

  const countBySeverity = (severity: string) =>
    issues.filter((i) => i.severity === severity).length;

  // Compute telop vs speech matches across all scenes
  const telopMatches = useMemo(() => {
    const results: TelopMatch[] = [];
    for (const scene of scenes) {
      if (scene.viData.detectedText.length === 0) continue;
      const speech = scene.geminiTranscription?.fullTranscript || "";
      for (const dt of scene.viData.detectedText) {
        results.push({
          sceneIndex: scene.index,
          startTimeSeconds: scene.startTimeSeconds,
          telopText: dt.text,
          speechText: speech,
          result: speech ? compareTelopSpeech(dt.text, speech) : "mismatch",
        });
      }
    }
    return results;
  }, [scenes]);

  const matchCount = telopMatches.filter((m) => m.result === "match").length;
  const partialCount = telopMatches.filter((m) => m.result === "partial").length;
  const mismatchCount = telopMatches.filter((m) => m.result === "mismatch").length;

  // Sort: mismatch first, then partial, then match
  const sortedMatches = useMemo(() => {
    const order: Record<MatchResult, number> = { mismatch: 0, partial: 1, match: 2 };
    return [...telopMatches].sort((a, b) => order[a.result] - order[b.result]);
  }, [telopMatches]);

  const handleTelopClick = (match: TelopMatch) => {
    setCurrentSceneIndex(match.sceneIndex);
    onIssueClick?.(match.startTimeSeconds);
  };

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
          <p className="text-xs text-gray-400 py-4 text-center">問題なし</p>
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

      {/* Telop vs Speech section */}
      {telopMatches.length > 0 && (
        <>
          <div className="border-t border-gray-200 pt-3">
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              テロップ vs 音声
            </p>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="px-2 py-0.5 rounded border text-[10px] font-medium bg-green-100 text-green-700 border-green-300">
                一致 {matchCount}
              </span>
              <span className="px-2 py-0.5 rounded border text-[10px] font-medium bg-yellow-100 text-yellow-700 border-yellow-300">
                部分 {partialCount}
              </span>
              <span className="px-2 py-0.5 rounded border text-[10px] font-medium bg-red-100 text-red-700 border-red-300">
                不一致 {mismatchCount}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            {sortedMatches.map((match, i) => {
              const bgColor = match.result === "match"
                ? "hover:bg-green-50 border-l-green-400"
                : match.result === "partial"
                ? "hover:bg-yellow-50 border-l-yellow-400"
                : "hover:bg-red-50 border-l-red-400";
              const icon = match.result === "match" ? "\u2713" : match.result === "partial" ? "?" : "\u2717";
              const iconColor = match.result === "match"
                ? "text-green-600"
                : match.result === "partial"
                ? "text-yellow-600"
                : "text-red-600";

              return (
                <button
                  key={`${match.sceneIndex}-${i}`}
                  onClick={() => handleTelopClick(match)}
                  className={`w-full text-left p-2 rounded border-l-2 bg-white transition-colors ${bgColor}`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className={`text-sm font-bold flex-shrink-0 ${iconColor}`}>{icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className="text-[10px] text-gray-400">#{match.sceneIndex + 1}</span>
                        <span className="text-[10px] text-gray-400">{formatTime(match.startTimeSeconds)}</span>
                      </div>
                      <p className="text-[11px] text-gray-700 truncate">
                        <span className="text-gray-400">字: </span>{match.telopText}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        <span className="text-gray-400">声: </span>{match.speechText || "（文字起こしなし）"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
