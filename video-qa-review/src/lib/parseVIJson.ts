/**
 * Parse Video Intelligence API JSON response (REST API format)
 * into our VIRawResult format.
 *
 * The test JSON uses snake_case (REST API format), while the SDK uses camelCase.
 * This parser handles the REST format from test_json.json.
 */
import type { VIRawResult } from "./videoIntelligence";

function timeToSeconds(offset: any): number {
  if (!offset) return 0;
  return (Number(offset.seconds) || 0) + (Number(offset.nanos) || 0) / 1e9;
}

export function parseVIJson(json: any): VIRawResult {
  // Merge all annotation results (VI API can split features across multiple entries)
  const allResults = json.annotation_results || json.annotationResults || [];
  const arList: any[] = allResults.length > 0 ? allResults : [json];

  // Shot changes
  const shotChanges: number[] = [0];
  for (const ar of arList) {
    const shots = ar.shot_annotations || ar.shotAnnotations || [];
    for (const shot of shots) {
      const end = timeToSeconds(shot.end_time_offset || shot.endTimeOffset);
      if (end > 0) shotChanges.push(end);
    }
  }

  // Text annotations
  const textAnnotations: VIRawResult["textAnnotations"] = [];
  for (const ar of arList) {
    const rawTexts = ar.text_annotations || ar.textAnnotations || [];
    for (const ta of rawTexts) {
      const text = ta.text || "";
      const segments = (ta.segments || []).map((seg: any) => {
        const s = seg.segment || seg;
        return {
          startSeconds: timeToSeconds(s.start_time_offset || s.startTimeOffset),
          endSeconds: timeToSeconds(s.end_time_offset || s.endTimeOffset),
        };
      });
      const confidence = ta.segments?.[0]?.confidence || 0;
      const frames: Array<{ timeSeconds: number; vertices: Array<{ x: number; y: number }> }> = [];
      for (const seg of ta.segments || []) {
        for (const f of seg.frames || []) {
          const rbb = f.rotated_bounding_box || f.rotatedBoundingBox;
          if (!rbb?.vertices) continue;
          frames.push({
            timeSeconds: timeToSeconds(f.time_offset || f.timeOffset),
            vertices: rbb.vertices.map((v: any) => ({ x: v.x || 0, y: v.y || 0 })),
          });
        }
      }
      textAnnotations.push({ text, confidence, segments, frames });
    }
  }

  // Speech transcriptions (often in a different annotationResult entry)
  const speechTranscriptions: VIRawResult["speechTranscriptions"] = [];
  for (const ar of arList) {
    const rawSpeech = ar.speech_transcriptions || ar.speechTranscriptions || [];
    for (const st of rawSpeech) {
      const alt = st.alternatives?.[0];
      const transcript = (alt?.transcript || "").replace(/\|[^\s|]+/g, "");
      const words = (alt?.words || []).map((w: any) => ({
        word: (w.word || "").split("|")[0],
        startSeconds: timeToSeconds(w.start_time || w.startTime),
        endSeconds: timeToSeconds(w.end_time || w.endTime),
        confidence: alt?.confidence || 0,
      }));
      speechTranscriptions.push({ transcript, words });
    }
  }

  // Explicit content
  const explicitFrames: VIRawResult["explicitFrames"] = [];
  for (const ar of arList) {
    const explicitAnnotation = ar.explicit_annotation || ar.explicitAnnotation;
    if (!explicitAnnotation) continue;
    for (const f of explicitAnnotation.frames || []) {
      explicitFrames.push({
        timeOffsetSeconds: timeToSeconds(f.time_offset || f.timeOffset),
        likelihood: String(f.pornography_likelihood || f.pornographyLikelihood || "UNKNOWN"),
      });
    }
  }

  // Labels (segment + shot combined)
  const labels: VIRawResult["labels"] = [];
  for (const ar of arList) {
    const segLabels = ar.segment_label_annotations || ar.segmentLabelAnnotations || [];
    const shotLabels = ar.shot_label_annotations || ar.shotLabelAnnotations || [];
    for (const la of [...segLabels, ...shotLabels]) {
      const description = la.entity?.description || "";
      const segments = (la.segments || []).map((seg: any) => {
        const s = seg.segment || seg;
        return {
          startSeconds: timeToSeconds(s.start_time_offset || s.startTimeOffset),
          endSeconds: timeToSeconds(s.end_time_offset || s.endTimeOffset),
        };
      });
      const confidence = la.segments?.[0]?.confidence || 0;
      labels.push({ description, confidence, segments });
    }
  }

  // Object annotations
  const objectAnnotations: VIRawResult["objectAnnotations"] = [];
  for (const ar of arList) {
    const rawObjects = ar.object_annotations || ar.objectAnnotations || [];
    for (const oa of rawObjects) {
      if ((oa.entity?.description || "").toLowerCase() === "person") continue;
      const description = oa.entity?.description || "";
      const confidence = oa.confidence || 0;
      const seg = oa.segment || {};
      const startSeconds = timeToSeconds(seg.start_time_offset || seg.startTimeOffset);
      const endSeconds = timeToSeconds(seg.end_time_offset || seg.endTimeOffset);
      const frames = (oa.frames || []).map((f: any) => {
        const bb = f.normalized_bounding_box || f.normalizedBoundingBox || {};
        return {
          timeSeconds: timeToSeconds(f.time_offset || f.timeOffset),
          boundingBox: {
            top: bb.top || 0,
            left: bb.left || 0,
            right: bb.right || 0,
            bottom: bb.bottom || 0,
          },
        };
      });
      objectAnnotations.push({ description, confidence, startSeconds, endSeconds, frames });
    }
  }

  // Person detections
  const personDetections: VIRawResult["personDetections"] = [];
  for (const ar of arList) {
    const rawPersons = ar.person_detection_annotations || ar.personDetectionAnnotations || [];
    for (const pda of rawPersons) {
      for (const track of pda.tracks || []) {
        const seg = track.segment || {};
        personDetections.push({
          startSeconds: timeToSeconds(seg.start_time_offset || seg.startTimeOffset),
          endSeconds: timeToSeconds(seg.end_time_offset || seg.endTimeOffset),
          timestampedObjects: (track.timestamped_objects || track.timestampedObjects || []).map((to: any) => {
            const bb = to.normalized_bounding_box || to.normalizedBoundingBox || {};
            return {
              timeSeconds: timeToSeconds(to.time_offset || to.timeOffset),
              boundingBox: {
                top: bb.top || 0,
                left: bb.left || 0,
                right: bb.right || 0,
                bottom: bb.bottom || 0,
              },
              landmarks: (to.landmarks || []).map((lm: any) => ({
                name: lm.name || "",
                x: lm.point?.x || 0,
                y: lm.point?.y || 0,
                confidence: lm.confidence || 0,
              })),
            };
          }),
        });
      }
    }
  }

  // Face detections
  const faceDetections: VIRawResult["faceDetections"] = [];
  for (const ar of arList) {
    const rawFaces = ar.face_detection_annotations || ar.faceDetectionAnnotations || [];
    for (const fda of rawFaces) {
      for (const track of fda.tracks || []) {
        const seg = track.segment || {};
        faceDetections.push({
          startSeconds: timeToSeconds(seg.start_time_offset || seg.startTimeOffset),
          endSeconds: timeToSeconds(seg.end_time_offset || seg.endTimeOffset),
          confidence: track.confidence || 0,
          timestampedObjects: (track.timestamped_objects || track.timestampedObjects || []).map((to: any) => {
            const bb = to.normalized_bounding_box || to.normalizedBoundingBox || {};
            return {
              timeSeconds: timeToSeconds(to.time_offset || to.timeOffset),
              boundingBox: {
                top: bb.top || 0,
                left: bb.left || 0,
                right: bb.right || 0,
                bottom: bb.bottom || 0,
              },
              attributes: (to.attributes || []).map((attr: any) => ({
                name: attr.name || "",
                confidence: attr.confidence || 0,
              })),
            };
          }),
        });
      }
    }
  }

  // Logo recognitions
  const logoRecognitions: VIRawResult["logoRecognitions"] = [];
  for (const ar of arList) {
    const rawLogos = ar.logo_recognition_annotations || ar.logoRecognitionAnnotations || [];
    for (const lra of rawLogos) {
      const description = lra.entity?.description || "";
      for (const track of lra.tracks || []) {
        const seg = track.segment || {};
        const firstObj = (track.timestamped_objects || track.timestampedObjects || [])[0];
        const bb = firstObj?.normalized_bounding_box || firstObj?.normalizedBoundingBox || {};
        logoRecognitions.push({
          description,
          confidence: track.confidence || 0,
          startSeconds: timeToSeconds(seg.start_time_offset || seg.startTimeOffset),
          endSeconds: timeToSeconds(seg.end_time_offset || seg.endTimeOffset),
          boundingBox: {
            top: bb.top || 0,
            left: bb.left || 0,
            right: bb.right || 0,
            bottom: bb.bottom || 0,
          },
        });
      }
    }
  }

  return { shotChanges, textAnnotations, speechTranscriptions, explicitFrames, labels, objectAnnotations, personDetections, faceDetections, logoRecognitions };
}
