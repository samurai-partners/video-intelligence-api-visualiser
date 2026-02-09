import { GoogleGenAI } from "@google/genai";
import type { Scene, SceneIssue } from "@/types/scene";
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

/**
 * Gemini APIで動画の音声を文字起こしする。
 * ワードレベルのタイムスタンプ付きJSONを返す。
 */
export async function transcribeWithGemini(
  videoFileUri: string
): Promise<{ words: Array<{ word: string; startSeconds: number; endSeconds: number }>; fullTranscript: string }> {
  const genAI = getGenAI();

  const prompt = `この動画の音声をすべて文字起こししてください。

以下のJSON形式で回答してください:
{
  "words": [
    { "word": "こんにちは", "startSeconds": 0.5, "endSeconds": 1.2 },
    { "word": "今日は", "startSeconds": 1.3, "endSeconds": 1.8 }
  ],
  "fullTranscript": "こんにちは今日は..."
}

重要なルール:
- 日本語は形態素（意味のある最小単位）ごとに分割してください（例: "今日は" "天気が" "いいですね"）
- 各ワードにstartSecondsとendSecondsを秒単位で付けてください
- BGMや効果音は無視し、発話内容のみをテキスト化してください
- 音声がない場合は words を空配列、fullTranscript を空文字列にしてください
- 全ての発話を漏れなく文字起こししてください`;

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

  const text = response.text || "{}";

  try {
    const parsed = JSON.parse(text);
    const words = (parsed.words || []).map((w: any) => ({
      word: String(w.word || ""),
      startSeconds: typeof w.startSeconds === "number" ? w.startSeconds : 0,
      endSeconds: typeof w.endSeconds === "number" ? w.endSeconds : 0,
    }));
    return {
      words,
      fullTranscript: parsed.fullTranscript || words.map((w: any) => w.word).join(""),
    };
  } catch {
    return { words: [], fullTranscript: "" };
  }
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
