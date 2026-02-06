"use client";

import { create } from "zustand";
import type { ProjectConfig, AnalysisStatus, TargetAudience } from "@/types/project";
import type { Scene } from "@/types/scene";
import type { Issue } from "@/types/issue";

interface DraftVideo {
  file: File | null;
  url: string;
  name: string;
  duration: number;
  size: number;
}

interface ProjectState {
  // Draft (before analysis)
  draftVideo: DraftVideo | null;
  draftConfig: ProjectConfig;
  projectName: string;

  // Video file storage (for API upload)
  videoFile: File | null;

  // Analysis
  analysisStatus: AnalysisStatus;
  scenes: Scene[];
  issues: Issue[];

  // Current view state
  currentSceneIndex: number;
  filterSeverity: Set<string>;

  // Actions
  setDraftVideo: (video: DraftVideo | null) => void;
  setVideoFile: (file: File | null) => void;
  setProjectName: (name: string) => void;
  updateDraftConfig: (partial: Partial<ProjectConfig>) => void;
  setAnalysisStatus: (status: AnalysisStatus) => void;
  setScenes: (scenes: Scene[]) => void;
  setIssues: (issues: Issue[]) => void;
  setCurrentSceneIndex: (index: number) => void;
  toggleSeverityFilter: (severity: string) => void;
  updateIssueStatus: (issueId: string, status: Issue["status"]) => void;
  reset: () => void;
}

const defaultConfig: ProjectConfig = {
  targetAudience: "children_3_6" as TargetAudience,
  videoPurpose: "",
  language: "ja",
  additionalRules: "",
};

export const useProjectStore = create<ProjectState>((set) => ({
  draftVideo: null,
  draftConfig: { ...defaultConfig },
  projectName: "",
  videoFile: null,
  analysisStatus: "pending",
  scenes: [],
  issues: [],
  currentSceneIndex: 0,
  filterSeverity: new Set(["critical", "warning", "info"]),

  setDraftVideo: (video) => set({ draftVideo: video }),
  setVideoFile: (file) => set({ videoFile: file }),
  setProjectName: (name) => set({ projectName: name }),
  updateDraftConfig: (partial) =>
    set((state) => ({
      draftConfig: { ...state.draftConfig, ...partial },
    })),
  setAnalysisStatus: (status) => set({ analysisStatus: status }),
  setScenes: (scenes) => set({ scenes }),
  setIssues: (issues) => set({ issues }),
  setCurrentSceneIndex: (index) => set({ currentSceneIndex: index }),
  toggleSeverityFilter: (severity) =>
    set((state) => {
      const next = new Set(state.filterSeverity);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return { filterSeverity: next };
    }),
  updateIssueStatus: (issueId, status) =>
    set((state) => ({
      issues: state.issues.map((i) =>
        i.id === issueId ? { ...i, status } : i
      ),
    })),
  reset: () =>
    set({
      draftVideo: null,
      draftConfig: { ...defaultConfig },
      projectName: "",
      videoFile: null,
      analysisStatus: "pending",
      scenes: [],
      issues: [],
      currentSceneIndex: 0,
      filterSeverity: new Set(["critical", "warning", "info"]),
    }),
}));
