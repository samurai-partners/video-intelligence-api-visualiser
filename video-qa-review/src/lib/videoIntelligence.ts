import { protos, VideoIntelligenceServiceClient } from "@google-cloud/video-intelligence";
import { timeOffsetToSeconds } from "./utils";
import type { Scene, DetectedText, SpeechWord, SceneLabel, ExplicitContentFrame, TrackedObject, PersonDetection, FaceDetection, LogoRecognition, BoundingBox, GeminiTranscription } from "@/types/scene";

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
    frames: Array<{ timeSeconds: number; vertices: Array<{ x: number; y: number }> }>;
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
  objectAnnotations: Array<{
    description: string;
    confidence: number;
    startSeconds: number;
    endSeconds: number;
    frames: Array<{ timeSeconds: number; boundingBox: BoundingBox }>;
  }>;
  personDetections: Array<{
    startSeconds: number;
    endSeconds: number;
    timestampedObjects: Array<{
      timeSeconds: number;
      boundingBox: BoundingBox;
      landmarks: Array<{ name: string; x: number; y: number; confidence: number }>;
    }>;
  }>;
  faceDetections: Array<{
    startSeconds: number;
    endSeconds: number;
    confidence: number;
    timestampedObjects: Array<{
      timeSeconds: number;
      boundingBox: BoundingBox;
      attributes: Array<{ name: string; confidence: number }>;
    }>;
  }>;
  logoRecognitions: Array<{
    description: string;
    confidence: number;
    startSeconds: number;
    endSeconds: number;
    boundingBox: BoundingBox;
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
      Feature.OBJECT_TRACKING,
      Feature.PERSON_DETECTION,
      Feature.FACE_DETECTION,
      Feature.LOGO_RECOGNITION,
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
    const frames: Array<{ timeSeconds: number; vertices: Array<{ x: number; y: number }> }> = [];
    for (const seg of ta.segments || []) {
      for (const f of seg.frames || []) {
        const verts = f.rotatedBoundingBox?.vertices;
        if (!verts) continue;
        frames.push({
          timeSeconds: timeOffsetToSeconds(f.timeOffset),
          vertices: verts.map((v) => ({ x: v.x || 0, y: v.y || 0 })),
        });
      }
    }
    return { text, confidence, segments, frames };
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

  // Object tracking (filter out "person" - handled by PERSON_DETECTION)
  const objectAnnotations = (annotationResults.objectAnnotations || [])
    .filter((oa) => (oa.entity?.description || "").toLowerCase() !== "person")
    .map((oa) => {
    const description = oa.entity?.description || "";
    const confidence = oa.confidence || 0;
    const startSeconds = timeOffsetToSeconds(oa.segment?.startTimeOffset);
    const endSeconds = timeOffsetToSeconds(oa.segment?.endTimeOffset);
    const frames = (oa.frames || []).map((f) => ({
      timeSeconds: timeOffsetToSeconds(f.timeOffset),
      boundingBox: {
        top: f.normalizedBoundingBox?.top || 0,
        left: f.normalizedBoundingBox?.left || 0,
        right: f.normalizedBoundingBox?.right || 0,
        bottom: f.normalizedBoundingBox?.bottom || 0,
      },
    }));
    return { description, confidence, startSeconds, endSeconds, frames };
  });

  // Person detection
  const personDetections = (annotationResults.personDetectionAnnotations || []).flatMap((pda) =>
    (pda.tracks || []).map((track) => ({
      startSeconds: timeOffsetToSeconds(track.segment?.startTimeOffset),
      endSeconds: timeOffsetToSeconds(track.segment?.endTimeOffset),
      timestampedObjects: (track.timestampedObjects || []).map((to) => ({
        timeSeconds: timeOffsetToSeconds(to.timeOffset),
        boundingBox: {
          top: to.normalizedBoundingBox?.top || 0,
          left: to.normalizedBoundingBox?.left || 0,
          right: to.normalizedBoundingBox?.right || 0,
          bottom: to.normalizedBoundingBox?.bottom || 0,
        },
        landmarks: (to.landmarks || []).map((lm) => ({
          name: lm.name || "",
          x: lm.point?.x || 0,
          y: lm.point?.y || 0,
          confidence: lm.confidence || 0,
        })),
      })),
    }))
  );

  // Face detection
  const faceDetections = (annotationResults.faceDetectionAnnotations || []).flatMap((fda) =>
    (fda.tracks || []).map((track) => ({
      startSeconds: timeOffsetToSeconds(track.segment?.startTimeOffset),
      endSeconds: timeOffsetToSeconds(track.segment?.endTimeOffset),
      confidence: track.confidence || 0,
      timestampedObjects: (track.timestampedObjects || []).map((to) => ({
        timeSeconds: timeOffsetToSeconds(to.timeOffset),
        boundingBox: {
          top: to.normalizedBoundingBox?.top || 0,
          left: to.normalizedBoundingBox?.left || 0,
          right: to.normalizedBoundingBox?.right || 0,
          bottom: to.normalizedBoundingBox?.bottom || 0,
        },
        attributes: (to.attributes || []).map((attr) => ({
          name: attr.name || "",
          confidence: attr.confidence || 0,
        })),
      })),
    }))
  );

  // Logo recognition
  const logoRecognitions = (annotationResults.logoRecognitionAnnotations || []).flatMap((lra) => {
    const description = lra.entity?.description || "";
    return (lra.tracks || []).map((track) => {
      const firstObj = track.timestampedObjects?.[0];
      return {
        description,
        confidence: track.confidence || 0,
        startSeconds: timeOffsetToSeconds(track.segment?.startTimeOffset),
        endSeconds: timeOffsetToSeconds(track.segment?.endTimeOffset),
        boundingBox: {
          top: firstObj?.normalizedBoundingBox?.top || 0,
          left: firstObj?.normalizedBoundingBox?.left || 0,
          right: firstObj?.normalizedBoundingBox?.right || 0,
          bottom: firstObj?.normalizedBoundingBox?.bottom || 0,
        },
      };
    });
  });

  return { shotChanges, textAnnotations, speechTranscriptions, explicitFrames, labels, objectAnnotations, personDetections, faceDetections, logoRecognitions };
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
            frames: ta.frames.filter((f) => f.timeSeconds >= start && f.timeSeconds < end),
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

    // Collect objects for this scene
    const sceneObjects: TrackedObject[] = viResult.objectAnnotations
      .filter((o) => o.startSeconds < end && o.endSeconds > start)
      .map((o) => ({
        description: o.description,
        confidence: o.confidence,
        startTimeSeconds: o.startSeconds,
        endTimeSeconds: o.endSeconds,
        frames: o.frames.filter((f) => f.timeSeconds >= start && f.timeSeconds < end),
      }));

    // Collect person detections for this scene (±0.15s buffer for edge frames)
    const scenePersons: PersonDetection[] = viResult.personDetections
      .filter((p) => p.startSeconds < end && p.endSeconds > start)
      .map((p) => {
        const sceneObjects = p.timestampedObjects.filter((to) => to.timeSeconds >= start - 0.15 && to.timeSeconds < end + 0.15);
        const firstObj = sceneObjects[0] || p.timestampedObjects[0];
        return {
          startTimeSeconds: p.startSeconds,
          endTimeSeconds: p.endSeconds,
          landmarks: firstObj?.landmarks || [],
          boundingBox: firstObj?.boundingBox || { top: 0, left: 0, right: 0, bottom: 0 },
          timestampedObjects: sceneObjects,
        };
      });

    // Collect face detections for this scene (±0.15s buffer for edge frames)
    const sceneFaces: FaceDetection[] = viResult.faceDetections
      .filter((f) => f.startSeconds < end && f.endSeconds > start)
      .map((f) => {
        const sceneObjects = f.timestampedObjects.filter((to) => to.timeSeconds >= start - 0.15 && to.timeSeconds < end + 0.15);
        const firstObj = sceneObjects[0] || f.timestampedObjects[0];
        return {
          startTimeSeconds: f.startSeconds,
          endTimeSeconds: f.endSeconds,
          confidence: f.confidence,
          attributes: firstObj?.attributes || [],
          boundingBox: firstObj?.boundingBox || { top: 0, left: 0, right: 0, bottom: 0 },
          timestampedObjects: sceneObjects,
        };
      });

    // Collect logo recognitions for this scene
    const sceneLogos: LogoRecognition[] = viResult.logoRecognitions
      .filter((l) => l.startSeconds < end && l.endSeconds > start)
      .map((l) => ({
        description: l.description,
        confidence: l.confidence,
        startTimeSeconds: l.startSeconds,
        endTimeSeconds: l.endSeconds,
        boundingBox: l.boundingBox,
      }));

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
        objects: sceneObjects,
        persons: scenePersons,
        faces: sceneFaces,
        logos: sceneLogos,
      },
    });
  }

  return scenes;
}

/**
 * Gemini文字起こし結果を各シーンに分配する。
 */
export function applyGeminiTranscription(
  scenes: Scene[],
  transcription: { words: Array<{ word: string; startSeconds: number; endSeconds: number }>; fullTranscript: string }
): void {
  for (const scene of scenes) {
    const sceneWords: SpeechWord[] = transcription.words
      .filter((w) => w.startSeconds >= scene.startTimeSeconds && w.startSeconds < scene.endTimeSeconds)
      .map((w) => ({
        word: w.word,
        startTimeSeconds: w.startSeconds,
        endTimeSeconds: w.endSeconds,
        confidence: 1.0,
      }));

    if (sceneWords.length > 0) {
      scene.geminiTranscription = {
        words: sceneWords,
        fullTranscript: sceneWords.map((w) => w.word).join(""),
      };
    }
  }
}
