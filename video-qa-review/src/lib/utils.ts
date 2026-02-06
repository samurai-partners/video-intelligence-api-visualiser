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
