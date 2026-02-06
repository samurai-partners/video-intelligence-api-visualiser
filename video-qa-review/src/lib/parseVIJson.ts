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
  const ar = json.annotation_results?.[0] || json.annotationResults?.[0] || json;

  // Shot changes
  const shotChanges: number[] = [0];
  const shots = ar.shot_annotations || ar.shotAnnotations || [];
  for (const shot of shots) {
    const end = timeToSeconds(shot.end_time_offset || shot.endTimeOffset);
    if (end > 0) shotChanges.push(end);
  }

  // Text annotations
  const rawTexts = ar.text_annotations || ar.textAnnotations || [];
  const textAnnotations = rawTexts.map((ta: any) => {
    const text = ta.text || "";
    const segments = (ta.segments || []).map((seg: any) => {
      const s = seg.segment || seg;
      return {
        startSeconds: timeToSeconds(s.start_time_offset || s.startTimeOffset),
        endSeconds: timeToSeconds(s.end_time_offset || s.endTimeOffset),
      };
    });
    const confidence = ta.segments?.[0]?.confidence || 0;
    // Extract per-frame bounding boxes from all segments
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
    return { text, confidence, segments, frames };
  });

  // Speech transcriptions
  const rawSpeech = ar.speech_transcriptions || ar.speechTranscriptions || [];
  const speechTranscriptions = rawSpeech.map((st: any) => {
    const alt = st.alternatives?.[0];
    const transcript = alt?.transcript || "";
    const words = (alt?.words || []).map((w: any) => ({
      word: w.word || "",
      startSeconds: timeToSeconds(w.start_time || w.startTime),
      endSeconds: timeToSeconds(w.end_time || w.endTime),
      confidence: alt?.confidence || 0,
    }));
    return { transcript, words };
  });

  // Explicit content
  const explicitAnnotation = ar.explicit_annotation || ar.explicitAnnotation;
  const explicitFrames = (explicitAnnotation?.frames || []).map((f: any) => ({
    timeOffsetSeconds: timeToSeconds(f.time_offset || f.timeOffset),
    likelihood: String(
      f.pornography_likelihood || f.pornographyLikelihood || "UNKNOWN"
    ),
  }));

  // Labels (segment + shot combined)
  const segLabels = ar.segment_label_annotations || ar.segmentLabelAnnotations || [];
  const shotLabels = ar.shot_label_annotations || ar.shotLabelAnnotations || [];
  const allLabels = [...segLabels, ...shotLabels];

  const labels = allLabels.map((la: any) => {
    const description = la.entity?.description || "";
    const segments = (la.segments || []).map((seg: any) => {
      const s = seg.segment || seg;
      return {
        startSeconds: timeToSeconds(s.start_time_offset || s.startTimeOffset),
        endSeconds: timeToSeconds(s.end_time_offset || s.endTimeOffset),
      };
    });
    const confidence = la.segments?.[0]?.confidence || 0;
    return { description, confidence, segments };
  });

  // Object annotations
  const rawObjects = ar.object_annotations || ar.objectAnnotations || [];
  const objectAnnotations = rawObjects.map((oa: any) => {
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
    return { description, confidence, startSeconds, endSeconds, frames };
  });

  // Person detections
  const rawPersons = ar.person_detection_annotations || ar.personDetectionAnnotations || [];
  const personDetections = rawPersons.flatMap((pda: any) =>
    (pda.tracks || []).map((track: any) => {
      const seg = track.segment || {};
      return {
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
      };
    })
  );

  // Face detections
  const rawFaces = ar.face_detection_annotations || ar.faceDetectionAnnotations || [];
  const faceDetections = rawFaces.flatMap((fda: any) =>
    (fda.tracks || []).map((track: any) => {
      const seg = track.segment || {};
      return {
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
      };
    })
  );

  // Logo recognitions
  const rawLogos = ar.logo_recognition_annotations || ar.logoRecognitionAnnotations || [];
  const logoRecognitions = rawLogos.flatMap((lra: any) => {
    const description = lra.entity?.description || "";
    return (lra.tracks || []).map((track: any) => {
      const seg = track.segment || {};
      const firstObj = (track.timestamped_objects || track.timestampedObjects || [])[0];
      const bb = firstObj?.normalized_bounding_box || firstObj?.normalizedBoundingBox || {};
      return {
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
      };
    });
  });

  return { shotChanges, textAnnotations, speechTranscriptions, explicitFrames, labels, objectAnnotations, personDetections, faceDetections, logoRecognitions };
}
