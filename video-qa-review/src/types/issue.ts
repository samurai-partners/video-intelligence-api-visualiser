export type IssueSeverity = "critical" | "warning" | "info";

export type IssueCategory =
  | "telop"
  | "speech"
  | "visual"
  | "tone"
  | "context"
  | "custom_rule";

export type IssueStatus = "open" | "acknowledged" | "dismissed";

export interface Issue {
  id: string;
  sceneIndex: number;
  timestampSeconds: number;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  suggestion: string;
  status: IssueStatus;
}
