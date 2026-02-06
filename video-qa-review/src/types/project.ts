export type TargetAudience =
  | "children_3_6"
  | "children_7_12"
  | "general"
  | "corporate"
  | "custom";

export interface ProjectConfig {
  targetAudience: TargetAudience;
  targetAudienceCustom?: string;
  videoPurpose: string;
  language: string;
  additionalRules: string;
}

export type AnalysisStatus =
  | "pending"
  | "uploading"
  | "analyzing_vi"
  | "segmenting"
  | "analyzing_gemini"
  | "completed"
  | "failed";

export interface Project {
  id: string;
  name: string;
  config: ProjectConfig;
  videoUrl: string;
  videoDuration: number;
  analysisStatus: AnalysisStatus;
  createdAt: string;
  updatedAt: string;
}
