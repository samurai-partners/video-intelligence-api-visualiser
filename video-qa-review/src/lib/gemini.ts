import { GoogleGenAI } from "@google/genai";
import type { Scene, SceneIssue, GeminiTranscription } from "@/types/scene";
import type { Issue, IssueCategory, IssueSeverity } from "@/types/issue";
import type { ProjectConfig } from "@/types/project";
import { generateId, TARGET_AUDIENCE_LABELS } from "./utils";

let _genAI: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!_genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");
    _genAI = new GoogleGenAI({ apiKey });
  }
  return _genAI;
}

/**
 * 動画をGemini Files APIにアップロードし、URIを返す。
 * アップロード後、処理完了（state=ACTIVE）までポーリングする。
 */
export async function uploadVideoToGemini(
  videoBuffer: Buffer,
  mimeType: string = "video/mp4"
): Promise<string> {
  const genAI = getGenAI();
  const blob = new Blob([new Uint8Array(videoBuffer)], { type: mimeType });
  const uploaded = await genAI.files.upload({
    file: blob,
    config: { mimeType, displayName: "qa-review-video" },
  });

  // 動画の処理完了を待つ
  let file = uploaded;
  while (file.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 2000));
    file = await genAI.files.get({ name: file.name! });
  }

  if (file.state === "FAILED") {
    throw new Error("Gemini動画処理に失敗しました");
  }

  return file.uri!;
}

export interface GeminiTranscriptionResult {
  words: Array<{ word: string; startSeconds: number; endSeconds: number }>;
  fullTranscript: string;
  detectedLanguage: string;
  translatedTranscript: string;
  translatedWords: Array<{ word: string; startSeconds: number; endSeconds: number }>;
}

/**
 * Gemini APIで動画の音声を文字起こしする。
 * 多言語対応 + 日本語翻訳付き。
 */
export async function transcribeWithGemini(
  videoFileUri: string,
  translateTo: string = "ja"
): Promise<GeminiTranscriptionResult> {
  const genAI = getGenAI();

  const prompt = `Transcribe ALL speech in this video. The video may contain multiple languages.

Return JSON in this exact format:
{
  "detectedLanguage": "the primary language detected (ISO 639-1 code, e.g. ja, en, ar, zh)",
  "words": [
    { "word": "Hello", "startSeconds": 0.5, "endSeconds": 1.2 },
    { "word": "world", "startSeconds": 1.3, "endSeconds": 1.8 }
  ],
  "fullTranscript": "Hello world...",
  "translatedTranscript": "こんにちは世界...",
  "translatedWords": [
    { "word": "こんにちは", "startSeconds": 0.5, "endSeconds": 1.2 },
    { "word": "世界", "startSeconds": 1.3, "endSeconds": 1.8 }
  ]
}

Rules:
- Transcribe in the ORIGINAL language as spoken
- For Japanese, split into morphemes (意味のある最小単位, e.g. "今日は" "天気が" "いいですね")
- For English and other space-separated languages, split by word
- For Arabic/Chinese/etc, split into natural phrase units
- Each word MUST have startSeconds and endSeconds timestamps in seconds
- Ignore BGM and sound effects — only transcribe human speech
- If no speech is detected, set words to empty array and fullTranscript to empty string
- translatedTranscript: translate fullTranscript into ${translateTo === "ja" ? "Japanese (日本語)" : translateTo}
- translatedWords: translate each word/phrase, keeping the SAME timestamps as the original
- If the original language is already ${translateTo === "ja" ? "Japanese" : translateTo}, set translatedTranscript and translatedWords to empty
- Transcribe ALL speech completely — do not skip any part`;

  const response = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user" as const,
        parts: [
          { fileData: { fileUri: videoFileUri, mimeType: "video/mp4" } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  return parseTranscriptionResponse(response.text || "{}");
}

function parseTranscriptionResponse(text: string): GeminiTranscriptionResult {
  try {
    const parsed = JSON.parse(text);
    const words = (parsed.words || []).map((w: any) => ({
      word: String(w.word || ""),
      startSeconds: typeof w.startSeconds === "number" ? w.startSeconds : 0,
      endSeconds: typeof w.endSeconds === "number" ? w.endSeconds : 0,
    }));
    const translatedWords = (parsed.translatedWords || []).map((w: any) => ({
      word: String(w.word || ""),
      startSeconds: typeof w.startSeconds === "number" ? w.startSeconds : 0,
      endSeconds: typeof w.endSeconds === "number" ? w.endSeconds : 0,
    }));
    return {
      words,
      fullTranscript: parsed.fullTranscript || words.map((w: { word: string }) => w.word).join(""),
      detectedLanguage: parsed.detectedLanguage || "unknown",
      translatedTranscript: parsed.translatedTranscript || "",
      translatedWords,
    };
  } catch {
    return { words: [], fullTranscript: "", detectedLanguage: "unknown", translatedTranscript: "", translatedWords: [] };
  }
}

export interface ChunkSceneInput {
  sceneIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

export interface ChunkTranscriptionResult {
  scenes: Array<{
    sceneIndex: number;
    words: Array<{ word: string; startSeconds: number; endSeconds: number }>;
    fullTranscript: string;
    detectedLanguage: string;
    translatedTranscript: string;
    translatedWords: Array<{ word: string; startSeconds: number; endSeconds: number }>;
  }>;
}

/**
 * ffmpegで切り出したチャンク動画をGeminiにアップロードし、文字起こし。
 * チャンク内のシーン境界を相対時間(0秒始まり)で指示し、
 * 返ってきたタイムスタンプにオフセットを加算して元の動画時間に変換する。
 */
export async function transcribeChunkWithGemini(
  chunkVideoBuffer: Buffer,
  chunkScenes: ChunkSceneInput[],
  chunkOffsetSeconds: number,
  translateTo: string = "ja"
): Promise<ChunkTranscriptionResult> {
  const genAI = getGenAI();

  // Upload chunk to Gemini Files API
  const videoFileUri = await uploadVideoToGemini(chunkVideoBuffer);

  // Scene boundaries in relative time (0-based within chunk)
  const sceneBoundaries = chunkScenes
    .map((s) => {
      const relStart = (s.startTimeSeconds - chunkOffsetSeconds).toFixed(1);
      const relEnd = (s.endTimeSeconds - chunkOffsetSeconds).toFixed(1);
      return `- Scene ${s.sceneIndex}: ${relStart}s - ${relEnd}s`;
    })
    .join("\n");

  const chunkDuration = (chunkScenes[chunkScenes.length - 1].endTimeSeconds - chunkOffsetSeconds).toFixed(1);

  const prompt = `Transcribe ALL speech in this video (0s to ${chunkDuration}s).
Split the transcription by the following scene boundaries:
${sceneBoundaries}

Return JSON in this exact format:
{
  "scenes": [
    {
      "sceneIndex": 0,
      "detectedLanguage": "ja",
      "words": [
        { "word": "こんにちは", "startSeconds": 0.5, "endSeconds": 1.2 }
      ],
      "fullTranscript": "こんにちは...",
      "translatedTranscript": "",
      "translatedWords": []
    }
  ]
}

Rules:
- Return one entry per scene listed above, in the same order
- Each scene's words must only contain speech that occurs within that scene's time range
- Transcribe in the ORIGINAL language as spoken
- For Japanese, split into morphemes (意味のある最小単位, e.g. "今日は" "天気が" "いいですね")
- For English and other space-separated languages, split by word
- Each word MUST have accurate startSeconds and endSeconds timestamps (relative to this video clip, starting from 0)
- Ignore BGM and sound effects — only transcribe human speech
- If no speech in a scene, set its words to empty array and fullTranscript to empty string
- translatedTranscript: translate into ${translateTo === "ja" ? "Japanese (日本語)" : translateTo}
- translatedWords: translate each word/phrase, keeping the SAME timestamps
- If the original language is already ${translateTo === "ja" ? "Japanese" : translateTo}, set translatedTranscript and translatedWords to empty
- You MUST include ALL ${chunkScenes.length} scenes in your response`;

  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user" as const,
        parts: [
          { fileData: { fileUri: videoFileUri, mimeType: "video/mp4" } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 65536,
    },
  });

  return parseChunkTranscriptionResponse(response.text || "{}", chunkScenes, chunkOffsetSeconds);
}

function parseChunkTranscriptionResponse(text: string, chunkScenes: ChunkSceneInput[], chunkOffsetSeconds: number): ChunkTranscriptionResult {
  try {
    const parsed = JSON.parse(text);
    const rawScenes = parsed.scenes || [];

    // Step 1: 全ワードを1つのプールに集約（絶対時間に変換）
    type Word = { word: string; startSeconds: number; endSeconds: number };
    const allWords: Word[] = [];
    const allTranslatedWords: Word[] = [];
    const langMap = new Map<number, string>();

    for (const rs of rawScenes) {
      if (rs.detectedLanguage) langMap.set(rs.sceneIndex, rs.detectedLanguage);
      for (const w of rs.words || []) {
        allWords.push({
          word: String(w.word || ""),
          startSeconds: (typeof w.startSeconds === "number" ? w.startSeconds : 0) + chunkOffsetSeconds,
          endSeconds: (typeof w.endSeconds === "number" ? w.endSeconds : 0) + chunkOffsetSeconds,
        });
      }
      for (const w of rs.translatedWords || []) {
        allTranslatedWords.push({
          word: String(w.word || ""),
          startSeconds: (typeof w.startSeconds === "number" ? w.startSeconds : 0) + chunkOffsetSeconds,
          endSeconds: (typeof w.endSeconds === "number" ? w.endSeconds : 0) + chunkOffsetSeconds,
        });
      }
    }

    // Step 2: 時間順にソート
    allWords.sort((a, b) => a.startSeconds - b.startSeconds);
    allTranslatedWords.sort((a, b) => a.startSeconds - b.startSeconds);

    // Step 3: 各ワードをタイムスタンプで正しいシーンに再割り当て（±0.5秒マージン）
    const MARGIN = 0.5;
    const assignToScenes = (words: Word[]) => {
      const buckets = new Map<number, Word[]>();
      for (const input of chunkScenes) buckets.set(input.sceneIndex, []);
      for (const w of words) {
        // ワードのstartSecondsがどのシーン範囲に入るか
        let assigned = false;
        for (const input of chunkScenes) {
          if (w.startSeconds >= input.startTimeSeconds - MARGIN &&
              w.startSeconds < input.endTimeSeconds + MARGIN) {
            buckets.get(input.sceneIndex)!.push(w);
            assigned = true;
            break;
          }
        }
        // どのシーンにも入らない場合は最も近いシーンに割り当て
        if (!assigned && chunkScenes.length > 0) {
          let closest = chunkScenes[0];
          let minDist = Infinity;
          for (const input of chunkScenes) {
            const mid = (input.startTimeSeconds + input.endTimeSeconds) / 2;
            const dist = Math.abs(w.startSeconds - mid);
            if (dist < minDist) { minDist = dist; closest = input; }
          }
          buckets.get(closest.sceneIndex)!.push(w);
        }
      }
      return buckets;
    };

    const wordBuckets = assignToScenes(allWords);
    const translatedBuckets = assignToScenes(allTranslatedWords);

    // Step 4: シーンごとに結果を構築
    const scenes = chunkScenes.map((input) => {
      const sceneWords = wordBuckets.get(input.sceneIndex) || [];
      const sceneTranslated = translatedBuckets.get(input.sceneIndex) || [];
      return {
        sceneIndex: input.sceneIndex,
        words: sceneWords,
        fullTranscript: sceneWords.map((w) => w.word).join(""),
        detectedLanguage: langMap.get(input.sceneIndex) || "unknown",
        translatedTranscript: sceneTranslated.map((w) => w.word).join(""),
        translatedWords: sceneTranslated,
      };
    });

    return { scenes };
  } catch {
    return {
      scenes: chunkScenes.map((input) => ({
        sceneIndex: input.sceneIndex,
        words: [],
        fullTranscript: "",
        detectedLanguage: "unknown",
        translatedTranscript: "",
        translatedWords: [],
      })),
    };
  }
}

/**
 * シーンを自然な区切りでチャンクにグループ化。
 * シーンを順に足していき、累計が targetSeconds を超えたら
 * そのシーンまで含めて区切る。シーンの途中では絶対に切らない。
 * チャンクの長さはバラバラでOK — 処理速度のための分割であり、
 * 正確な秒数で切る必要はない。
 */
export function createTimeChunks(scenes: ChunkSceneInput[], targetSeconds: number = 60): ChunkSceneInput[][] {
  const chunks: ChunkSceneInput[][] = [];
  let currentChunk: ChunkSceneInput[] = [];
  let chunkStartTime = 0;

  for (const scene of scenes) {
    if (currentChunk.length === 0) {
      chunkStartTime = scene.startTimeSeconds;
    }
    currentChunk.push(scene);

    // このシーンを含めた時点で target を超えたら、ここで区切る
    const chunkDuration = scene.endTimeSeconds - chunkStartTime;
    if (chunkDuration >= targetSeconds) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

function buildSystemPrompt(): string {
  return `あなたは動画品質チェックのプロフェッショナルなQAレビューアーです。
動画の各シーンについて、ターゲット視聴者に不適切な箇所を検出してください。

検出カテゴリ:
- telop: テロップ・字幕の問題（難しい漢字、不適切な表現、誤字脱字）
- speech: 音声・ナレーションの問題（不適切な発言、分かりにくい説明）
- visual: 映像の問題（暴力的、不適切な映像、品質問題）
- tone: トーン・雰囲気の問題（怖い音楽、ターゲットに不向きな演出）
- context: コンテキストの矛盾（教育動画なのに商品宣伝等）
- custom_rule: ユーザー指定のカスタムルール違反

重要度:
- critical: 必ず修正すべき重大な問題
- warning: 修正を推奨する警告
- info: 参考情報・軽微な指摘

必ずJSON形式で回答してください。`;
}

function buildScenePrompt(scene: Scene, totalScenes: number, config: ProjectConfig): string {
  const audienceLabel = TARGET_AUDIENCE_LABELS[config.targetAudience] || config.targetAudienceCustom || config.targetAudience;

  let prompt = `## シーン ${scene.index + 1} / ${totalScenes}
時間: ${scene.startTimeSeconds.toFixed(1)}s ~ ${scene.endTimeSeconds.toFixed(1)}s（${scene.durationSeconds.toFixed(1)}秒間）

### チェック条件
- ターゲット視聴者: ${audienceLabel}
- 動画の目的: ${config.videoPurpose}
- 言語: ${config.language}`;

  if (config.additionalRules) {
    prompt += `\n- 追加ルール: ${config.additionalRules}`;
  }

  prompt += `\n\n### このシーンのデータ`;

  // OCR text
  if (scene.viData.detectedText.length > 0) {
    prompt += `\n\n#### 検出テキスト（OCR）:`;
    for (const t of scene.viData.detectedText) {
      prompt += `\n- "${t.text}" (${t.startTimeSeconds.toFixed(1)}s, 信頼度: ${(t.confidence * 100).toFixed(0)}%)`;
    }
  } else {
    prompt += `\n\n#### 検出テキスト: なし`;
  }

  // Speech (prefer Gemini transcription)
  const transcript = scene.geminiTranscription?.fullTranscript || scene.viData.fullTranscript;
  const transcriptSource = scene.geminiTranscription ? "Gemini" : "VI API";
  if (transcript) {
    prompt += `\n\n#### 音声文字起こし（${transcriptSource}）:\n"${transcript}"`;
  } else {
    prompt += `\n\n#### 音声文字起こし: なし`;
  }

  // Labels
  if (scene.viData.labels.length > 0) {
    prompt += `\n\n#### 映像ラベル:`;
    for (const l of scene.viData.labels) {
      prompt += `\n- ${l.description} (${(l.confidence * 100).toFixed(0)}%)`;
    }
  }

  // Explicit content
  if (scene.viData.explicitContent.maxLikelihood !== "UNKNOWN" &&
      scene.viData.explicitContent.maxLikelihood !== "VERY_UNLIKELY") {
    prompt += `\n\n#### 不適切コンテンツ検出: ${scene.viData.explicitContent.maxLikelihood}`;
  }

  prompt += `\n\n### 重要な指示
添付された動画の ${scene.startTimeSeconds.toFixed(1)}秒 〜 ${scene.endTimeSeconds.toFixed(1)}秒 の区間を視聴し、以下を行ってください:
1. 映像内に表示されているテロップ・字幕・テキストを正確に読み取る
2. 音声（ナレーション・会話）を正確に文字起こしする
3. 上記のデータとVI API検出データを合わせて品質チェックを行う

### 回答形式
以下のJSON形式で回答してください:
{
  "summary": "このシーンの簡潔な説明（1-2文）",
  "overallRisk": "low" | "medium" | "high",
  "detectedTextSummary": "映像内に表示されているテロップ・字幕・テキストを正確に列挙。テキストがない場合は空文字列。",
  "speechSummary": "このシーンの音声の文字起こし。発話内容を正確にテキスト化する。音声がない場合は空文字列。",
  "issues": [
    {
      "category": "telop" | "speech" | "visual" | "tone" | "context" | "custom_rule",
      "severity": "critical" | "warning" | "info",
      "description": "問題の説明",
      "suggestion": "修正案",
      "timestamp": シーン内の該当秒数（number）
    }
  ]
}

detectedTextSummary について:
- 動画の映像から直接テキストを読み取ってください（OCRデータは参考程度に）
- テロップが複数ある場合は改行（\\n）で区切ってください
- テキストがない場合は空文字列にしてください

speechSummary について:
- 動画の音声から直接文字起こししてください（VI APIの文字起こしは参考程度に）
- BGMや効果音は無視し、発話内容のみをテキスト化してください
- 音声がない場合は空文字列にしてください

問題がない場合は issues を空配列にしてください。`;

  return prompt;
}

export interface GeminiSceneResult {
  summary: string;
  overallRisk: "low" | "medium" | "high";
  detectedTextSummary: string;
  speechSummary: string;
  issues: Array<{
    category: string;
    severity: string;
    description: string;
    suggestion: string;
    timestamp: number;
  }>;
}

export async function analyzeSceneWithGemini(
  scene: Scene,
  totalScenes: number,
  config: ProjectConfig,
  videoFileUri?: string
): Promise<GeminiSceneResult> {
  const genAI = getGenAI();
  const systemPrompt = buildSystemPrompt();
  const scenePrompt = buildScenePrompt(scene, totalScenes, config);

  // 動画URIがある場合はマルチモーダル（動画+テキスト）で送信
  const contents = videoFileUri
    ? [
        {
          role: "user" as const,
          parts: [
            { fileData: { fileUri: videoFileUri, mimeType: "video/mp4" } },
            { text: scenePrompt },
          ],
        },
      ]
    : scenePrompt;

  const response = await genAI.models.generateContent({
    model: "gemini-2.0-flash",
    contents,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
    },
  });

  const text = response.text || "{}";

  try {
    const parsed = JSON.parse(text);
    // Validate and normalize
    const validCategories = ["telop", "speech", "visual", "tone", "context", "custom_rule"];
    const validSeverities = ["critical", "warning", "info"];
    const validRisks = ["low", "medium", "high"];

    return {
      summary: parsed.summary || "解析結果なし",
      overallRisk: validRisks.includes(parsed.overallRisk) ? parsed.overallRisk : "low",
      detectedTextSummary: parsed.detectedTextSummary || "",
      speechSummary: parsed.speechSummary || "",
      issues: (parsed.issues || []).map((issue: any) => ({
        category: validCategories.includes(issue.category) ? issue.category : "visual",
        severity: validSeverities.includes(issue.severity) ? issue.severity : "info",
        description: issue.description || "",
        suggestion: issue.suggestion || "",
        timestamp: typeof issue.timestamp === "number" ? issue.timestamp : scene.startTimeSeconds,
      })),
    };
  } catch {
    return {
      summary: "JSON解析に失敗しました",
      overallRisk: "low",
      detectedTextSummary: "",
      speechSummary: "",
      issues: [],
    };
  }
}

export async function analyzeAllScenes(
  scenes: Scene[],
  config: ProjectConfig,
  onProgress?: (sceneIndex: number, result: GeminiSceneResult) => void,
  videoFileUri?: string
): Promise<{ analyzedScenes: Scene[]; issues: Issue[] }> {
  const analyzedScenes: Scene[] = [];
  const allIssues: Issue[] = [];

  for (const scene of scenes) {
    const result = await analyzeSceneWithGemini(scene, scenes.length, config, videoFileUri);

    const sceneIssues: SceneIssue[] = result.issues.map((issue) => ({
      id: generateId(),
      category: issue.category,
      severity: issue.severity,
      description: issue.description,
      suggestion: issue.suggestion,
      timestamp: issue.timestamp,
    }));

    const analyzedScene: Scene = {
      ...scene,
      geminiAnalysis: {
        summary: result.summary,
        issues: sceneIssues,
        overallRisk: result.overallRisk,
        detectedTextSummary: result.detectedTextSummary || undefined,
        speechSummary: result.speechSummary || undefined,
      },
    };

    analyzedScenes.push(analyzedScene);

    // Flatten issues into top-level format
    for (const issue of result.issues) {
      allIssues.push({
        id: generateId(),
        sceneIndex: scene.index,
        timestampSeconds: issue.timestamp,
        category: issue.category as IssueCategory,
        severity: issue.severity as IssueSeverity,
        title: `${issue.category}: ${issue.description.slice(0, 30)}`,
        description: issue.description,
        suggestion: issue.suggestion,
        status: "open",
      });
    }

    onProgress?.(scene.index, result);
  }

  return { analyzedScenes, issues: allIssues };
}
