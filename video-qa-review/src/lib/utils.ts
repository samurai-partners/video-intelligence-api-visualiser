import type { TextFrame } from "@/types/scene";

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function timeOffsetToSeconds(timeOffset?: any): number {
  if (!timeOffset) return 0;
  let seconds = Number(timeOffset.seconds) || 0;
  seconds += (Number(timeOffset.nanos) || 0) / 1e9;
  return seconds;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export type MatchResult = "match" | "partial" | "mismatch";

/** OCRアーティファクト除去用 */
const OCR_ARTIFACTS = /[[\]\/\\|(){}「」『』【】〈〉（）<>.,!?;:'"・、。…\-_~^]/g;

/** 形式名詞・副詞など、漢字/ひらがな表記揺れが頻出する語の正規化マップ（漢字→ひらがな） */
const KANJI_KANA_NORMALIZE: [RegExp, string][] = [
  [/方/g, "ほう"],
  [/事/g, "こと"],
  [/物/g, "もの"],
  [/所/g, "ところ"],
  [/時/g, "とき"],
  [/為/g, "ため"],
  [/訳/g, "わけ"],
  [/筈/g, "はず"],
  [/迄/g, "まで"],
  [/位/g, "くらい"],
  [/程/g, "ほど"],
  [/様/g, "よう"],
  [/通り/g, "とおり"],
  [/達/g, "たち"],
  [/等/g, "など"],
  [/丁度/g, "ちょうど"],
  [/沢山/g, "たくさん"],
  [/流石/g, "さすが"],
  [/勿論/g, "もちろん"],
  [/何故/g, "なぜ"],
  [/如何/g, "いかが"],
  [/頂/g, "いただ"],
  [/下さ/g, "くださ"],
  [/致し/g, "いたし"],
  [/御/g, "お"],
];

/** 漢字→ひらがな表記揺れを正規化 */
function normalizeKanjiKana(text: string): string {
  let result = text;
  for (const [pattern, replacement] of KANJI_KANA_NORMALIZE) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** テロップと音声テキストを比較（OCRアーティファクト耐性あり）
 *  currentSpeech: 逆方向ファジーマッチ用の現シーン音声（combinedSpeechが長い場合に使用）
 */
export function compareTelopSpeech(telop: string, speech: string, currentSpeech?: string): MatchResult {
  let t = normalizeKanjiKana(telop.replace(/[\s\u3000]/g, "").replace(OCR_ARTIFACTS, ""));
  let s = normalizeKanjiKana(speech.replace(/[\s\u3000]/g, "").replace(OCR_ARTIFACTS, ""));
  if (!t || !s) return "mismatch";
  // 完全一致 or 部分文字列
  if (t === s || s.includes(t) || t.includes(s)) return "match";
  // ファジーマッチ（全体）
  const maxLen = Math.max(t.length, s.length);
  if (levenshteinDistance(t, s) / maxLen < 0.15) return "match";
  // ファジー部分文字列（テロップがスピーチに含まれるか）
  if (t.length <= s.length && t.length >= 3) {
    const threshold = Math.ceil(t.length * 0.15);
    for (let i = 0; i <= s.length - t.length; i++) {
      if (levenshteinDistance(t, s.slice(i, i + t.length)) <= threshold) return "match";
    }
  }
  // 逆方向: 音声がテロップの部分文字列か（OCR結合テロップ対策）
  // combinedSpeechが渡されている場合はcurrentSpeech（現シーンのみ）で逆方向チェック
  const rs = normalizeKanjiKana((currentSpeech || speech).replace(/[\s\u3000]/g, "").replace(OCR_ARTIFACTS, ""));
  if (rs.length <= t.length && rs.length >= 3) {
    const threshold = Math.ceil(rs.length * 0.15);
    for (let i = 0; i <= t.length - rs.length; i++) {
      if (levenshteinDistance(rs, t.slice(i, i + rs.length)) <= threshold) return "match";
    }
  }
  // 文字重なり→partial
  const tChars = new Set([...t]);
  const overlap = [...tChars].filter((c) => s.includes(c)).length;
  if (overlap / tChars.size > 0.6) return "partial";
  return "mismatch";
}

/** Levenshtein edit distance (O(min(a,b)) space) */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length > b.length) [a, b] = [b, a];
  const aLen = a.length;
  const bLen = b.length;
  let prev = Array.from({ length: aLen + 1 }, (_, i) => i);
  let curr = new Array<number>(aLen + 1);
  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[aLen];
}

/** テキストフレーム群の平均バウンディングボックス面積を計算（0〜1正規化） */
export function getAverageBboxArea(frames: TextFrame[]): number {
  if (frames.length === 0) return 0;
  let total = 0;
  for (const f of frames) {
    const xs = f.vertices.map((v) => v.x);
    const ys = f.vertices.map((v) => v.y);
    total += (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }
  return total / frames.length;
}

/** OCRノイズ判定: 短い断片的テキストはノイズとして除外 */
function isOcrNoise(norm: string): boolean {
  if (norm.length === 0) return true;
  // 漢字またはひらがなを含む → 意味のあるテロップの可能性が高い
  const hasKanjiOrHiragana = /[\u4e00-\u9fff\u3040-\u309f]/.test(norm);
  if (hasKanjiOrHiragana) return norm.length <= 1;
  // カタカナのみ → 3文字以下はノイズ（ーナー、ヨン、ント、チー等）
  const isKatakanaOnly = /^[\u30a0-\u30ff\u30fc]+$/.test(norm);
  if (isKatakanaOnly) return norm.length <= 3;
  // ASCII/数字/記号のみ → 5文字以下はノイズ（Carak、15m、Hala等）
  return norm.length <= 5;
}

/**
 * OCRテキストの重複排除（ファジーマッチ対応）。
 * - OCRノイズ（1-2文字のASCII）を除外
 * - テキスト長→信頼度の降順でソート（長く信頼度の高いものを優先）
 * - 部分文字列なら除外
 * - 編集距離が短い方の30%以内ならファジーマージ（代表テキストは信頼度が高い方を採用）
 * - 同一テキストの重複エントリは時間範囲をマージ
 */
export function deduplicateDetectedText<
  T extends { text: string; startTimeSeconds: number; endTimeSeconds: number; confidence: number; frames: TextFrame[] }
>(texts: T[], bboxThreshold: number = 0.005): T[] {
  if (texts.length <= 1) return texts;

  // Phase 1: filter noise (text length + bounding box area)
  const filtered = texts.filter((entry) => {
    const norm = entry.text.replace(/[\s\u3000]/g, "");
    if (isOcrNoise(norm)) return false;
    if (entry.frames.length > 0 && getAverageBboxArea(entry.frames) < bboxThreshold) return false;
    return true;
  });
  if (filtered.length === 0) return [];

  // Phase 2: sort by length desc, then confidence desc
  const sorted = [...filtered].sort((a, b) => {
    const lenDiff = b.text.length - a.text.length;
    if (lenDiff !== 0) return lenDiff;
    return b.confidence - a.confidence;
  });

  // Phase 3: group with fuzzy matching
  const result: T[] = [];
  const norms: string[] = []; // parallel array for cached normalized strings

  for (const entry of sorted) {
    const norm = entry.text.replace(/[\s\u3000]/g, "");
    if (!norm) continue;

    // Skip if substring of already-accepted text
    if (norms.some((accepted) => accepted.includes(norm))) continue;

    // Find fuzzy match in already-accepted entries
    const fuzzyIdx = norms.findIndex((accepted) => {
      if (accepted === norm) return true;
      const shorter = Math.min(norm.length, accepted.length);
      if (shorter < 3) return false;
      const threshold = Math.ceil(shorter * 0.3);
      return levenshteinDistance(norm, accepted) <= threshold;
    });

    if (fuzzyIdx >= 0) {
      // Merge into existing group
      const existing = result[fuzzyIdx];
      const useNewText = entry.confidence > existing.confidence;
      result[fuzzyIdx] = {
        ...existing,
        text: useNewText ? entry.text : existing.text,
        startTimeSeconds: Math.min(existing.startTimeSeconds, entry.startTimeSeconds),
        endTimeSeconds: Math.max(existing.endTimeSeconds, entry.endTimeSeconds),
        confidence: Math.max(existing.confidence, entry.confidence),
        frames: [...existing.frames, ...entry.frames],
      } as T;
      if (useNewText) norms[fuzzyIdx] = norm;
    } else {
      result.push(entry);
      norms.push(norm);
    }
  }

  return result;
}

/**
 * 全シーン横断で頻出するテロップを検出。
 * threshold割合以上のシーンに出現するテキストを返す。
 */
export function detectPersistentText(
  scenes: Array<{ viData: { detectedText: Array<{ text: string }> } }>,
  threshold: number = 0.3
): string[] {
  if (scenes.length === 0) return [];
  const textSceneCount = new Map<string, number>();
  for (const scene of scenes) {
    const seen = new Set<string>();
    for (const dt of scene.viData.detectedText) {
      const norm = dt.text.replace(/[\s\u3000]/g, "");
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      textSceneCount.set(norm, (textSceneCount.get(norm) || 0) + 1);
    }
  }
  const minCount = Math.ceil(scenes.length * threshold);
  return [...textSceneCount.entries()]
    .filter(([, count]) => count >= minCount)
    .map(([text]) => text);
}

export const TARGET_AUDIENCE_LABELS: Record<string, string> = {
  children_3_6: "子供（3〜6歳）",
  children_7_12: "子供（7〜12歳）",
  general: "一般",
  corporate: "企業向け",
  custom: "カスタム",
};

export const SEVERITY_LABELS: Record<string, string> = {
  critical: "重大",
  warning: "警告",
  info: "情報",
};

export const CATEGORY_LABELS: Record<string, string> = {
  telop: "テロップ",
  speech: "音声",
  visual: "映像",
  tone: "トーン",
  context: "コンテキスト",
  custom_rule: "カスタムルール",
};

export interface SpeechSentence {
  words: Array<{ word: string; startTimeSeconds: number; endTimeSeconds: number; confidence: number }>;
  text: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

export function groupWordsIntoSentences(
  words: Array<{ word: string; startTimeSeconds: number; endTimeSeconds: number; confidence: number }>
): SpeechSentence[] {
  if (words.length === 0) return [];

  const sentences: SpeechSentence[] = [];
  let currentWords: typeof words = [];

  for (const w of words) {
    currentWords.push(w);
    // Split on sentence-ending punctuation
    if (/[.!?。！？]$/.test(w.word.trim())) {
      sentences.push(buildSentence(currentWords));
      currentWords = [];
    }
  }

  // Remaining words form the last sentence
  if (currentWords.length > 0) {
    sentences.push(buildSentence(currentWords));
  }

  return sentences;
}

function buildSentence(
  words: Array<{ word: string; startTimeSeconds: number; endTimeSeconds: number; confidence: number }>
): SpeechSentence {
  return {
    words,
    text: words.map((w) => w.word).join(""),
    startTimeSeconds: words[0].startTimeSeconds,
    endTimeSeconds: words[words.length - 1].endTimeSeconds,
  };
}
