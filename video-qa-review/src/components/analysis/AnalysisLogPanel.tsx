"use client";

import { useEffect, useRef } from "react";

export interface LogEntry {
  level: "info" | "warn" | "error" | "success";
  message: string;
  detail: unknown;
  timestamp: string;
}

interface AnalysisLogPanelProps {
  logs: LogEntry[];
  isOpen: boolean;
  onToggle: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  success: "text-green-400",
};

const LEVEL_LABELS: Record<string, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  success: " OK ",
};

export function AnalysisLogPanel({ logs, isOpen, onToggle }: AnalysisLogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, isOpen]);

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-800 hover:bg-gray-750 transition-colors"
      >
        <span className="text-sm font-mono text-gray-300">
          解析ログ ({logs.length})
        </span>
        <span className="text-gray-500 text-xs">
          {isOpen ? "▼ 閉じる" : "▶ 開く"}
        </span>
      </button>

      {isOpen && (
        <div className="max-h-[400px] overflow-y-auto p-3 font-mono text-xs leading-relaxed">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2 mb-1">
              <span className="text-gray-600 flex-shrink-0">
                {new Date(log.timestamp).toLocaleTimeString("ja-JP")}
              </span>
              <span className={`flex-shrink-0 ${LEVEL_COLORS[log.level]}`}>
                [{LEVEL_LABELS[log.level]}]
              </span>
              <span className="text-gray-300">{log.message}</span>
              {log.detail != null && (
                <details className="inline">
                  <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                    [詳細]
                  </summary>
                  <pre className="text-gray-500 mt-1 ml-4 whitespace-pre-wrap break-all">
                    {JSON.stringify(log.detail, null, 2) as string}
                  </pre>
                </details>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
