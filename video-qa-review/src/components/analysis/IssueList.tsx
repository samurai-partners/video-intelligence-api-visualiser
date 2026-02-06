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
    <div className="space-y-2">
      {/* Filters - single row */}
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
    </div>
  );
}
