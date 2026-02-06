export interface DetectedText {
  text: string;
  confidence: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

export interface SpeechWord {
  word: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  confidence: number;
}

export interface SceneLabel {
  description: string;
  confidence: number;
}

export interface ExplicitContentFrame {
  timeOffsetSeconds: number;
  likelihood: string;
}

export interface SceneIssue {
  id: string;
  category: string;
  severity: string;
  description: string;
  suggestion: string;
  timestamp: number;
}

export interface Scene {
  index: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationSeconds: number;
  viData: {
    detectedText: DetectedText[];
    speechTranscription: SpeechWord[];
    fullTranscript: string;
    labels: SceneLabel[];
    explicitContent: {
      maxLikelihood: string;
      frames: ExplicitContentFrame[];
    };
  };
  geminiAnalysis?: {
    summary: string;
    issues: SceneIssue[];
    overallRisk: "low" | "medium" | "high";
  };
}
