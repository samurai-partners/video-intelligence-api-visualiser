"use client";

import type { Issue } from "@/types/issue";
import { formatTime, SEVERITY_LABELS, CATEGORY_LABELS } from "@/lib/utils";

interface IssueCardProps {
  issue: Issue;
  onClick?: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
};

const SEVERITY_DOTS: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

export function IssueCard({ issue, onClick }: IssueCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_DOTS[issue.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-500">
              {formatTime(issue.timestampSeconds)}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[issue.severity]}`}
            >
              {SEVERITY_LABELS[issue.severity]}
            </span>
            <span className="text-xs text-gray-400">
              {CATEGORY_LABELS[issue.category]}
            </span>
          </div>
          <p className="text-sm text-gray-800 line-clamp-2">{issue.description}</p>
          {issue.suggestion && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1">
              → {issue.suggestion}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
