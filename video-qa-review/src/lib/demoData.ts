import type { Scene } from "@/types/scene";
import type { Issue } from "@/types/issue";

export const DEMO_SCENES: Scene[] = [
  {
    index: 0,
    startTimeSeconds: 0,
    endTimeSeconds: 6.2,
    durationSeconds: 6.2,
    viData: {
      detectedText: [
        { text: "たのしい どうぶつえん", confidence: 0.95, startTimeSeconds: 0.5, endTimeSeconds: 5.0, frames: [] },
      ],
      speechTranscription: [
        { word: "みなさん", startTimeSeconds: 1.0, endTimeSeconds: 1.5, confidence: 0.92 },
        { word: "こんにちは", startTimeSeconds: 1.5, endTimeSeconds: 2.2, confidence: 0.95 },
      ],
      fullTranscript: "みなさん こんにちは！たのしい どうぶつえんへ ようこそ！",
      labels: [
        { description: "animation", confidence: 0.88 },
        { description: "title screen", confidence: 0.82 },
      ],
      explicitContent: { maxLikelihood: "VERY_UNLIKELY", frames: [] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "オープニングタイトル画面。明るいアニメーションで動物園を紹介。",
      issues: [],
      overallRisk: "low",
    },
  },
  {
    index: 1,
    startTimeSeconds: 6.2,
    endTimeSeconds: 18.5,
    durationSeconds: 12.3,
    viData: {
      detectedText: [
        { text: "ライオンの憂鬱", confidence: 0.91, startTimeSeconds: 7.0, endTimeSeconds: 12.0, frames: [] },
      ],
      speechTranscription: [
        { word: "つぎは", startTimeSeconds: 6.5, endTimeSeconds: 7.0, confidence: 0.90 },
        { word: "ライオンの", startTimeSeconds: 7.0, endTimeSeconds: 7.8, confidence: 0.93 },
        { word: "コーナー", startTimeSeconds: 7.8, endTimeSeconds: 8.5, confidence: 0.91 },
      ],
      fullTranscript: "つぎは ライオンのコーナーです。ライオンは ゆううつそうな かおを しています。",
      labels: [
        { description: "lion", confidence: 0.95 },
        { description: "animal", confidence: 0.97 },
        { description: "zoo", confidence: 0.85 },
      ],
      explicitContent: { maxLikelihood: "VERY_UNLIKELY", frames: [] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "ライオンのコーナー。テロップに難しい漢字が含まれている。",
      issues: [
        {
          id: "demo-issue-1",
          category: "telop",
          severity: "critical",
          description: "テロップ「憂鬱」は3-6歳の子供には読めない漢字です。ひらがなの多い表現に変更してください。",
          suggestion: "「ライオンさん ちょっと かなしそう」に変更",
          timestamp: 7.0,
        },
      ],
      overallRisk: "high",
    },
  },
  {
    index: 2,
    startTimeSeconds: 18.5,
    endTimeSeconds: 32.0,
    durationSeconds: 13.5,
    viData: {
      detectedText: [
        { text: "ぞうさんの おはなし", confidence: 0.93, startTimeSeconds: 19.0, endTimeSeconds: 25.0, frames: [] },
      ],
      speechTranscription: [],
      fullTranscript: "ぞうさんは とっても おおきいね！おはなが ながいのが とくちょうだよ。",
      labels: [
        { description: "elephant", confidence: 0.96 },
        { description: "animal", confidence: 0.98 },
      ],
      explicitContent: { maxLikelihood: "VERY_UNLIKELY", frames: [] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "象のコーナー。適切な表現で問題なし。",
      issues: [],
      overallRisk: "low",
    },
  },
  {
    index: 3,
    startTimeSeconds: 32.0,
    endTimeSeconds: 45.8,
    durationSeconds: 13.8,
    viData: {
      detectedText: [
        { text: "肉食動物の狩り", confidence: 0.89, startTimeSeconds: 33.0, endTimeSeconds: 38.0, frames: [] },
      ],
      speechTranscription: [],
      fullTranscript: "ここでは にくしょくどうぶつの かりの ようすを みてみましょう。",
      labels: [
        { description: "hunting", confidence: 0.78 },
        { description: "predator", confidence: 0.82 },
        { description: "wildlife", confidence: 0.90 },
      ],
      explicitContent: { maxLikelihood: "POSSIBLE", frames: [{ timeOffsetSeconds: 35.2, likelihood: "POSSIBLE" }] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "肉食動物の狩りのシーン。暴力的な映像と難しい漢字が含まれる。",
      issues: [
        {
          id: "demo-issue-2",
          category: "visual",
          severity: "critical",
          description: "肉食動物が獲物を捕らえるシーンは3-6歳の子供には刺激が強すぎます。",
          suggestion: "該当シーンを削除、またはイラストアニメーションに差し替え",
          timestamp: 35.0,
        },
        {
          id: "demo-issue-3",
          category: "telop",
          severity: "warning",
          description: "テロップ「肉食動物の狩り」は幼児には難しい漢字と概念です。",
          suggestion: "「どうぶつさんの ごはんタイム」などに変更",
          timestamp: 33.0,
        },
      ],
      overallRisk: "high",
    },
  },
  {
    index: 4,
    startTimeSeconds: 45.8,
    endTimeSeconds: 58.0,
    durationSeconds: 12.2,
    viData: {
      detectedText: [],
      speechTranscription: [],
      fullTranscript: "",
      labels: [
        { description: "dark scene", confidence: 0.75 },
        { description: "night", confidence: 0.80 },
      ],
      explicitContent: { maxLikelihood: "VERY_UNLIKELY", frames: [] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "夜の動物園シーン。暗いBGMと映像で不安な雰囲気。",
      issues: [
        {
          id: "demo-issue-4",
          category: "tone",
          severity: "warning",
          description: "BGMが不安を煽るトーンで、子供が怖がる可能性があります。暗い映像と相まって不適切な雰囲気です。",
          suggestion: "明るいBGMに差し替え、映像の明るさを上げる",
          timestamp: 47.0,
        },
      ],
      overallRisk: "medium",
    },
  },
  {
    index: 5,
    startTimeSeconds: 58.0,
    endTimeSeconds: 72.5,
    durationSeconds: 14.5,
    viData: {
      detectedText: [
        { text: "おすすめ商品はこちら！", confidence: 0.94, startTimeSeconds: 60.0, endTimeSeconds: 66.0, frames: [] },
        { text: "www.example-shop.com", confidence: 0.88, startTimeSeconds: 62.0, endTimeSeconds: 66.0, frames: [] },
      ],
      speechTranscription: [],
      fullTranscript: "ここで おすすめの しょうひんを しょうかいします！",
      labels: [
        { description: "advertisement", confidence: 0.92 },
        { description: "product", confidence: 0.85 },
      ],
      explicitContent: { maxLikelihood: "VERY_UNLIKELY", frames: [] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "商品宣伝シーン。教育動画のコンテキストと矛盾する。",
      issues: [
        {
          id: "demo-issue-5",
          category: "context",
          severity: "warning",
          description: "教育動画の途中に商品宣伝が挿入されており、コンテンツの一貫性を損なっています。",
          suggestion: "商品宣伝は動画の最後にまとめるか、別動画に分離",
          timestamp: 60.0,
        },
        {
          id: "demo-issue-6",
          category: "telop",
          severity: "info",
          description: "URLリンクが表示されていますが、幼児向けコンテンツでは不要です。",
          suggestion: "URLを削除",
          timestamp: 62.0,
        },
      ],
      overallRisk: "medium",
    },
  },
  {
    index: 6,
    startTimeSeconds: 72.5,
    endTimeSeconds: 85.0,
    durationSeconds: 12.5,
    viData: {
      detectedText: [
        { text: "また あそぼうね！", confidence: 0.96, startTimeSeconds: 75.0, endTimeSeconds: 82.0, frames: [] },
      ],
      speechTranscription: [],
      fullTranscript: "きょうは たのしかったね！また あそぼうね！バイバーイ！",
      labels: [
        { description: "animation", confidence: 0.90 },
        { description: "ending", confidence: 0.78 },
      ],
      explicitContent: { maxLikelihood: "VERY_UNLIKELY", frames: [] },
      objects: [], persons: [], faces: [], logos: [],
    },
    geminiAnalysis: {
      summary: "エンディング。明るい雰囲気で適切な締めくくり。",
      issues: [],
      overallRisk: "low",
    },
  },
];

export const DEMO_ISSUES: Issue[] = [
  {
    id: "demo-issue-1",
    sceneIndex: 1,
    timestampSeconds: 7.0,
    category: "telop",
    severity: "critical",
    title: "テロップ: 難しい漢字「憂鬱」",
    description: "テロップ「憂鬱」は3-6歳の子供には読めない漢字です。ひらがなの多い表現に変更してください。",
    suggestion: "「ライオンさん ちょっと かなしそう」に変更",
    status: "open",
  },
  {
    id: "demo-issue-2",
    sceneIndex: 3,
    timestampSeconds: 35.0,
    category: "visual",
    severity: "critical",
    title: "映像: 暴力的な狩りシーン",
    description: "肉食動物が獲物を捕らえるシーンは3-6歳の子供には刺激が強すぎます。",
    suggestion: "該当シーンを削除、またはイラストアニメーションに差し替え",
    status: "open",
  },
  {
    id: "demo-issue-3",
    sceneIndex: 3,
    timestampSeconds: 33.0,
    category: "telop",
    severity: "warning",
    title: "テロップ: 難しい表現「肉食動物の狩り」",
    description: "テロップ「肉食動物の狩り」は幼児には難しい漢字と概念です。",
    suggestion: "「どうぶつさんの ごはんタイム」などに変更",
    status: "open",
  },
  {
    id: "demo-issue-4",
    sceneIndex: 4,
    timestampSeconds: 47.0,
    category: "tone",
    severity: "warning",
    title: "トーン: 不安なBGMと暗い映像",
    description: "BGMが不安を煽るトーンで、子供が怖がる可能性があります。暗い映像と相まって不適切な雰囲気です。",
    suggestion: "明るいBGMに差し替え、映像の明るさを上げる",
    status: "open",
  },
  {
    id: "demo-issue-5",
    sceneIndex: 5,
    timestampSeconds: 60.0,
    category: "context",
    severity: "warning",
    title: "コンテキスト: 教育動画内の商品宣伝",
    description: "教育動画の途中に商品宣伝が挿入されており、コンテンツの一貫性を損なっています。",
    suggestion: "商品宣伝は動画の最後にまとめるか、別動画に分離",
    status: "open",
  },
  {
    id: "demo-issue-6",
    sceneIndex: 5,
    timestampSeconds: 62.0,
    category: "telop",
    severity: "info",
    title: "テロップ: 不要なURL表示",
    description: "URLリンクが表示されていますが、幼児向けコンテンツでは不要です。",
    suggestion: "URLを削除",
    status: "open",
  },
];
