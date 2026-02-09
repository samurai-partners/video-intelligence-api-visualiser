"use client";

import { create } from "zustand";
import type { ProjectConfig, AnalysisStatus, TargetAudience } from "@/types/project";
import type { Scene, GeminiTranscription } from "@/types/scene";
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
  transcriptionProgress: { completed: number; total: number } | null;

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
  updateScenesTranscription: (updates: Array<{ index: number; geminiTranscription: GeminiTranscription }>) => void;
  setTranscriptionProgress: (progress: { completed: number; total: number } | null) => void;
  setCurrentSceneIndex: (index: number) => void;
  toggleSeverityFilter: (severity: string) => void;
  updateIssueStatus: (issueId: string, status: Issue["status"]) => void;
  reset: () => void;
}

const defaultConfig: ProjectConfig = {
  targetAudience: "children_3_6" as TargetAudience,
  videoPurpose: "",
  language: "auto",
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
  transcriptionProgress: null,
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
  updateScenesTranscription: (updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => {
        const update = updates.find((u) => u.index === scene.index);
        if (!update) return scene;
        return { ...scene, geminiTranscription: update.geminiTranscription };
      }),
    })),
  setTranscriptionProgress: (progress) => set({ transcriptionProgress: progress }),
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
      transcriptionProgress: null,
      currentSceneIndex: 0,
      filterSeverity: new Set(["critical", "warning", "info"]),
    }),
}));
