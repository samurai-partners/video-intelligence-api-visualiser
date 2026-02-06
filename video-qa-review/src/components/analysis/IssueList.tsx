"use client";

import { useProjectStore } from "@/stores/useProjectStore";
import { IssueCard } from "./IssueCard";
import { SEVERITY_LABELS } from "@/lib/utils";

interface IssueListProps {
  onIssueClick?: (timestampSeconds: number) => void;
}

export function IssueList({ onIssueClick }: IssueListProps) {
  const issues = useProjectStore((s) => s.issues);
  const filterSeverity = useProjectStore((s) => s.filterSeverity);
  const toggleSeverityFilter = useProjectStore((s) => s.toggleSeverityFilter);

  const filteredIssues = issues.filter((i) => filterSeverity.has(i.severity));

  const countBySeverity = (severity: string) =>
    issues.filter((i) => i.severity === severity).length;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">フィルター</p>
        {(["critical", "warning", "info"] as const).map((sev) => {
          const count = countBySeverity(sev);
          const colors: Record<string, string> = {
            critical: "text-red-600",
            warning: "text-yellow-600",
            info: "text-blue-600",
          };
          return (
            <label key={sev} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filterSeverity.has(sev)}
                onChange={() => toggleSeverityFilter(sev)}
                className="rounded"
              />
              <span className={colors[sev]}>
                {SEVERITY_LABELS[sev]} ({count})
              </span>
            </label>
          );
        })}
      </div>

      {/* Issue list */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          問題一覧 ({filteredIssues.length})
        </p>
        {filteredIssues.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">問題なし</p>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
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
    </div>
  );
}
