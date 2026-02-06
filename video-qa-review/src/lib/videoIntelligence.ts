import { protos, VideoIntelligenceServiceClient } from "@google-cloud/video-intelligence";
import { timeOffsetToSeconds } from "./utils";
import type { Scene, DetectedText, SpeechWord, SceneLabel, ExplicitContentFrame } from "@/types/scene";

const Feature = protos.google.cloud.videointelligence.v1.Feature;

let _client: VideoIntelligenceServiceClient | null = null;
function getClient(): VideoIntelligenceServiceClient {
  if (!_client) {
    _client = new VideoIntelligenceServiceClient();
  }
  return _client;
}

export interface VIRawResult {
  shotChanges: number[];
  textAnnotations: Array<{
    text: string;
    confidence: number;
    segments: Array<{ startSeconds: number; endSeconds: number }>;
  }>;
  speechTranscriptions: Array<{
    transcript: string;
    words: Array<{
      word: string;
      startSeconds: number;
      endSeconds: number;
      confidence: number;
    }>;
  }>;
  explicitFrames: Array<{
    timeOffsetSeconds: number;
    likelihood: string;
  }>;
  labels: Array<{
    description: string;
    confidence: number;
    segments: Array<{ startSeconds: number; endSeconds: number }>;
  }>;
}

export async function analyzeVideo(videoBuffer: Buffer): Promise<VIRawResult> {
  const inputContent = videoBuffer.toString("base64");

  const request = {
    inputContent,
    features: [
      Feature.SHOT_CHANGE_DETECTION,
      Feature.TEXT_DETECTION,
      Feature.SPEECH_TRANSCRIPTION,
      Feature.EXPLICIT_CONTENT_DETECTION,
      Feature.LABEL_DETECTION,
    ],
    videoContext: {
      speechTranscriptionConfig: {
        languageCode: "ja-JP",
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
      },
    },
  };

  const operationResponse = await getClient().annotateVideo(request);
  const operation = operationResponse[0];
  const operationResults = await operation.promise();
  const operationResult = operationResults[0];

  const annotationResults = operationResult.annotationResults?.[0];
  if (!annotationResults) {
    throw new Error("Video Intelligence APIから結果が返されませんでした");
  }

  // Shot changes
  const shotChanges: number[] = [0];
  const shotAnnotations = annotationResults.shotAnnotations || [];
  for (const shot of shotAnnotations) {
    const endTime = timeOffsetToSeconds(shot.endTimeOffset);
    if (endTime > 0) shotChanges.push(endTime);
  }

  // Text detection
  const textAnnotations = (annotationResults.textAnnotations || []).map((ta) => {
    const text = ta.text || "";
    const segments = (ta.segments || []).map((seg) => ({
      startSeconds: timeOffsetToSeconds(seg.segment?.startTimeOffset),
      endSeconds: timeOffsetToSeconds(seg.segment?.endTimeOffset),
    }));
    const confidence = ta.segments?.[0]?.confidence || 0;
    return { text, confidence, segments };
  });

  // Speech transcription
  const speechTranscriptions = (annotationResults.speechTranscriptions || []).map((st) => {
    const alt = st.alternatives?.[0];
    const transcript = alt?.transcript || "";
    const words = (alt?.words || []).map((w) => ({
      word: w.word || "",
      startSeconds: timeOffsetToSeconds(w.startTime),
      endSeconds: timeOffsetToSeconds(w.endTime),
      confidence: alt?.confidence || 0,
    }));
    return { transcript, words };
  });

  // Explicit content
  const explicitFrames = (annotationResults.explicitAnnotation?.frames || []).map((f) => ({
    timeOffsetSeconds: timeOffsetToSeconds(f.timeOffset),
    likelihood: String(f.pornographyLikelihood || "UNKNOWN"),
  }));

  // Labels
  const labels = (annotationResults.segmentLabelAnnotations || []).map((la) => {
    const description = la.entity?.description || "";
    const segments = (la.segments || []).map((seg) => ({
      startSeconds: timeOffsetToSeconds(seg.segment?.startTimeOffset),
      endSeconds: timeOffsetToSeconds(seg.segment?.endTimeOffset),
    }));
    const confidence = la.segments?.[0]?.confidence || 0;
    return { description, confidence, segments };
  });

  return { shotChanges, textAnnotations, speechTranscriptions, explicitFrames, labels };
}

export function segmentIntoScenes(viResult: VIRawResult, videoDuration: number): Scene[] {
  const boundaries = [...new Set(viResult.shotChanges)].sort((a, b) => a - b);
  if (boundaries[0] !== 0) boundaries.unshift(0);

  const scenes: Scene[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : videoDuration;

    // Collect detected text for this scene's time range
    const detectedText: DetectedText[] = [];
    for (const ta of viResult.textAnnotations) {
      for (const seg of ta.segments) {
        if (seg.startSeconds < end && seg.endSeconds > start) {
          detectedText.push({
            text: ta.text,
            confidence: ta.confidence,
            startTimeSeconds: seg.startSeconds,
            endTimeSeconds: seg.endSeconds,
          });
        }
      }
    }

    // Collect speech words for this scene
    const speechWords: SpeechWord[] = [];
    let fullTranscript = "";
    for (const st of viResult.speechTranscriptions) {
      for (const w of st.words) {
        if (w.startSeconds >= start && w.startSeconds < end) {
          speechWords.push({
            word: w.word,
            startTimeSeconds: w.startSeconds,
            endTimeSeconds: w.endSeconds,
            confidence: w.confidence,
          });
        }
      }
      // Build transcript for this scene
      const sceneWords = st.words.filter((w) => w.startSeconds >= start && w.startSeconds < end);
      if (sceneWords.length > 0) {
        fullTranscript += sceneWords.map((w) => w.word).join("") + " ";
      }
    }

    // Collect labels that overlap with this scene
    const sceneLabels: SceneLabel[] = [];
    for (const la of viResult.labels) {
      for (const seg of la.segments) {
        if (seg.startSeconds < end && seg.endSeconds > start) {
          sceneLabels.push({
            description: la.description,
            confidence: la.confidence,
          });
          break;
        }
      }
    }

    // Collect explicit content frames for this scene
    const explicitFrames: ExplicitContentFrame[] = viResult.explicitFrames.filter(
      (f) => f.timeOffsetSeconds >= start && f.timeOffsetSeconds < end
    );
    const likelihoodOrder = ["UNKNOWN", "VERY_UNLIKELY", "UNLIKELY", "POSSIBLE", "LIKELY", "VERY_LIKELY"];
    let maxLikelihood = "UNKNOWN";
    for (const f of explicitFrames) {
      if (likelihoodOrder.indexOf(f.likelihood) > likelihoodOrder.indexOf(maxLikelihood)) {
        maxLikelihood = f.likelihood;
      }
    }

    scenes.push({
      index: i,
      startTimeSeconds: start,
      endTimeSeconds: end,
      durationSeconds: end - start,
      viData: {
        detectedText,
        speechTranscription: speechWords,
        fullTranscript: fullTranscript.trim(),
        labels: sceneLabels,
        explicitContent: {
          maxLikelihood,
          frames: explicitFrames,
        },
      },
    });
  }

  return scenes;
}
