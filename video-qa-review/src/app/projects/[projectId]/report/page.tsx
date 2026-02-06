"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { pdf } from "@react-pdf/renderer";
import { useProjectStore } from "@/stores/useProjectStore";
import { formatTime, SEVERITY_LABELS, CATEGORY_LABELS, TARGET_AUDIENCE_LABELS } from "@/lib/utils";
import { ReportPDF } from "@/components/report/ReportPDF";

export default function ReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);

  const projectName = useProjectStore((s) => s.projectName);
  const draftConfig = useProjectStore((s) => s.draftConfig);
  const draftVideo = useProjectStore((s) => s.draftVideo);
  const issues = useProjectStore((s) => s.issues);
  const scenes = useProjectStore((s) => s.scenes);

  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const audienceLabel =
    TARGET_AUDIENCE_LABELS[draftConfig.targetAudience] ||
    draftConfig.targetAudienceCustom ||
    draftConfig.targetAudience;

  const generateTextReport = () => {
    let text = `動画QAレビューレポート\n`;
    text += `========================\n`;
    text += `プロジェクト: ${projectName || projectId}\n`;
    text += `解析日: ${new Date().toLocaleDateString("ja-JP")}\n`;
    text += `ターゲット: ${audienceLabel}\n`;
    text += `動画長: ${draftVideo ? formatTime(draftVideo.duration) : "不明"}\n`;
    text += `\n`;
    text += `全体評価: 重大${criticalCount}件、警告${warningCount}件、情報${infoCount}件\n`;
    text += `\n`;
    text += `問題一覧:\n`;
    text += `--------\n`;

    issues.forEach((issue, i) => {
      text += `#${i + 1} [${SEVERITY_LABELS[issue.severity]}] ${formatTime(issue.timestampSeconds)}\n`;
      text += `  カテゴリ: ${CATEGORY_LABELS[issue.category]}\n`;
      text += `  内容: ${issue.description}\n`;
      if (issue.suggestion) {
        text += `  修正案: ${issue.suggestion}\n`;
      }
      text += `\n`;
    });

    return text;
  };

  const generateCSV = () => {
    const header = "#,タイムスタンプ,カテゴリ,重要度,検出内容,理由,修正案";
    const rows = issues.map((issue, i) =>
      [
        i + 1,
        formatTime(issue.timestampSeconds),
        CATEGORY_LABELS[issue.category],
        SEVERITY_LABELS[issue.severity],
        `"${issue.title}"`,
        `"${issue.description}"`,
        `"${issue.suggestion}"`,
      ].join(",")
    );
    return [header, ...rows].join("\n");
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    alert("コピーしました");
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const doc = (
        <ReportPDF
          projectName={projectName || projectId}
          config={draftConfig}
          videoDuration={draftVideo?.duration || 0}
          scenes={scenes}
          issues={issues}
        />
      );
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qa-report-${projectId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("PDF生成に失敗しました: " + (err instanceof Error ? err.message : "不明なエラー"));
    } finally {
      setPdfLoading(false);
    }
  }, [projectName, projectId, draftConfig, draftVideo, scenes, issues]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← レビュー画面に戻る
        </Link>
        <h1 className="text-2xl font-bold mt-2">レポート</h1>
      </div>

      {/* Export buttons */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={downloadPDF}
          disabled={pdfLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {pdfLoading ? "PDF生成中..." : "PDFダウンロード"}
        </button>
        <button
          onClick={() => downloadFile(generateCSV(), `qa-report-${projectId}.csv`, "text/csv")}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          CSVダウンロード
        </button>
        <button
          onClick={() => copyToClipboard(generateTextReport())}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
        >
          テキストコピー
        </button>
      </div>

      {/* Report preview */}
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="border-b border-gray-200 pb-6 mb-6">
          <h2 className="text-xl font-bold">動画QAレビューレポート</h2>
          <div className="mt-3 text-sm text-gray-600 space-y-1">
            <p>プロジェクト: {projectName || projectId}</p>
            <p>解析日: {new Date().toLocaleDateString("ja-JP")}</p>
            <p>ターゲット: {audienceLabel}</p>
            <p>動画長: {draftVideo ? formatTime(draftVideo.duration) : "不明"}</p>
            <p>シーン数: {scenes.length}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-6">
          <h3 className="font-semibold mb-2">全体評価</h3>
          <div className="flex gap-4">
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm">
              重大: {criticalCount}件
            </span>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm">
              警告: {warningCount}件
            </span>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm">
              情報: {infoCount}件
            </span>
          </div>
        </div>

        {/* Issue details */}
        <div>
          <h3 className="font-semibold mb-3">問題一覧</h3>
          {issues.length === 0 ? (
            <p className="text-gray-400">問題は検出されませんでした</p>
          ) : (
            <div className="space-y-4">
              {issues.map((issue, i) => (
                <div key={issue.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-700">#{i + 1}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        issue.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : issue.severity === "warning"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {SEVERITY_LABELS[issue.severity]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(issue.timestampSeconds)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {CATEGORY_LABELS[issue.category]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="text-sm text-gray-500 mt-1">修正案: {issue.suggestion}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
