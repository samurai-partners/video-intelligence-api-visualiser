"use client";

import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { Issue } from "@/types/issue";
import type { ProjectConfig } from "@/types/project";
import type { Scene } from "@/types/scene";
import { formatTime, SEVERITY_LABELS, CATEGORY_LABELS, TARGET_AUDIENCE_LABELS } from "@/lib/utils";

// Register Noto Sans JP for Japanese support
Font.register({
  family: "NotoSansJP",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.1/files/noto-sans-jp-japanese-400-normal.woff",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.1/files/noto-sans-jp-japanese-700-normal.woff",
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "NotoSansJP",
    fontSize: 10,
    color: "#1a1a1a",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 16,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1e3a5f",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 10,
    color: "#6b7280",
    lineHeight: 1.6,
  },
  summaryBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 700,
  },
  badgeCritical: {
    backgroundColor: "#fef2f2",
    color: "#dc2626",
  },
  badgeWarning: {
    backgroundColor: "#fffbeb",
    color: "#d97706",
  },
  badgeInfo: {
    backgroundColor: "#eff6ff",
    color: "#2563eb",
  },
  issueSection: {
    marginBottom: 16,
  },
  issueSectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 10,
    color: "#1e3a5f",
  },
  issueCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  issueHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  issueNumber: {
    fontSize: 9,
    fontWeight: 700,
    color: "#6b7280",
  },
  issueTimestamp: {
    fontSize: 9,
    color: "#9ca3af",
    fontFamily: "Courier",
  },
  issueCategory: {
    fontSize: 8,
    color: "#6b7280",
  },
  issueDesc: {
    fontSize: 10,
    lineHeight: 1.5,
    marginTop: 2,
  },
  issueSuggestion: {
    fontSize: 9,
    color: "#4b5563",
    marginTop: 4,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "#d1d5db",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
});

interface ReportPDFProps {
  projectName: string;
  config: ProjectConfig;
  videoDuration: number;
  scenes: Scene[];
  issues: Issue[];
}

export function ReportPDF({ projectName, config, videoDuration, scenes, issues }: ReportPDFProps) {
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const audienceLabel =
    TARGET_AUDIENCE_LABELS[config.targetAudience] ||
    config.targetAudienceCustom ||
    config.targetAudience;

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>動画QAレビューレポート</Text>
          <Text style={styles.subtitle}>
            プロジェクト: {projectName}{"\n"}
            解析日: {today}{"\n"}
            ターゲット: {audienceLabel}{"\n"}
            動画長: {formatTime(videoDuration)}　|　シーン数: {scenes.length}
          </Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>全体評価</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.badge, styles.badgeCritical]}>
              重大: {criticalCount}件
            </Text>
            <Text style={[styles.badge, styles.badgeWarning]}>
              警告: {warningCount}件
            </Text>
            <Text style={[styles.badge, styles.badgeInfo]}>
              情報: {infoCount}件
            </Text>
          </View>
        </View>

        {/* Issues */}
        <View style={styles.issueSection}>
          <Text style={styles.issueSectionTitle}>問題一覧</Text>
          {issues.length === 0 ? (
            <Text style={{ color: "#9ca3af" }}>問題は検出されませんでした</Text>
          ) : (
            issues.map((issue, i) => {
              const severityStyle =
                issue.severity === "critical"
                  ? styles.badgeCritical
                  : issue.severity === "warning"
                  ? styles.badgeWarning
                  : styles.badgeInfo;

              return (
                <View key={issue.id} style={styles.issueCard} wrap={false}>
                  <View style={styles.issueHeader}>
                    <Text style={styles.issueNumber}>#{i + 1}</Text>
                    <Text style={[styles.badge, severityStyle]}>
                      {SEVERITY_LABELS[issue.severity]}
                    </Text>
                    <Text style={styles.issueTimestamp}>
                      {formatTime(issue.timestampSeconds)}
                    </Text>
                    <Text style={styles.issueCategory}>
                      {CATEGORY_LABELS[issue.category]}
                    </Text>
                  </View>
                  <Text style={styles.issueDesc}>{issue.description}</Text>
                  {issue.suggestion ? (
                    <Text style={styles.issueSuggestion}>修正案: {issue.suggestion}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Video QA Review - 自動生成レポート | {today}
        </Text>
      </Page>
    </Document>
  );
}
