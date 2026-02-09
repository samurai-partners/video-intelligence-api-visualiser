export interface TextFrame {
  timeSeconds: number;
  vertices: Array<{ x: number; y: number }>;
}

export interface DetectedText {
  text: string;
  confidence: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  frames: TextFrame[];
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

export interface BoundingBox {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface TrackedObject {
  description: string;
  confidence: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  frames: Array<{ timeSeconds: number; boundingBox: BoundingBox }>;
}

export interface TimestampedPersonObject {
  timeSeconds: number;
  boundingBox: BoundingBox;
  landmarks: Array<{ name: string; x: number; y: number; confidence: number }>;
}

export interface PersonDetection {
  startTimeSeconds: number;
  endTimeSeconds: number;
  landmarks: Array<{ name: string; x: number; y: number; confidence: number }>;
  boundingBox: BoundingBox;
  timestampedObjects: TimestampedPersonObject[];
}

export interface TimestampedFaceObject {
  timeSeconds: number;
  boundingBox: BoundingBox;
  attributes: Array<{ name: string; confidence: number }>;
}

export interface FaceDetection {
  startTimeSeconds: number;
  endTimeSeconds: number;
  confidence: number;
  attributes: Array<{ name: string; confidence: number }>;
  boundingBox: BoundingBox;
  timestampedObjects: TimestampedFaceObject[];
}

export interface LogoRecognition {
  description: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  confidence: number;
  boundingBox: BoundingBox;
}

export interface GeminiTranscription {
  words: SpeechWord[];
  fullTranscript: string;
  detectedLanguage?: string;
  translatedTranscript?: string;
  translatedWords?: SpeechWord[];
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
    objects: TrackedObject[];
    persons: PersonDetection[];
    faces: FaceDetection[];
    logos: LogoRecognition[];
  };
  geminiTranscription?: GeminiTranscription;
  geminiAnalysis?: {
    summary: string;
    issues: SceneIssue[];
    overallRisk: "low" | "medium" | "high";
    detectedTextSummary?: string;
    speechSummary?: string;
  };
}
