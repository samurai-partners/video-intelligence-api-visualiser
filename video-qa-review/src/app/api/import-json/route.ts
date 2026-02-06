import { NextRequest, NextResponse } from "next/server";
import { segmentIntoScenes } from "@/lib/videoIntelligence";
import { parseVIJson } from "@/lib/parseVIJson";
import { analyzeSceneWithGemini } from "@/lib/gemini";
import type { ProjectConfig } from "@/types/project";
import type { Issue, IssueCategory, IssueSeverity } from "@/types/issue";
import { generateId } from "@/lib/utils";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const jsonFile = formData.get("json") as File | null;
    const durationStr = formData.get("duration") as string | null;
    const configStr = formData.get("config") as string | null;

    if (!jsonFile) {
      return NextResponse.json({ error: "JSONファイルが不足しています" }, { status: 400 });
    }

    const jsonText = await jsonFile.text();
    const rawJson = JSON.parse(jsonText);
    const viResult = parseVIJson(rawJson);
    const videoDuration = parseFloat(durationStr || "0") || 300;

    const scenes = segmentIntoScenes(viResult, videoDuration);

    // Gemini analysis if available
    const config: ProjectConfig = configStr ? JSON.parse(configStr) : {
      targetAudience: "children_3_6",
      videoPurpose: "",
      language: "ja",
      additionalRules: "",
    };
    const allIssues: Issue[] = [];

    if (process.env.GEMINI_API_KEY) {
      for (const scene of scenes) {
        const result = await analyzeSceneWithGemini(scene, scenes.length, config);
        scene.geminiAnalysis = {
          summary: result.summary,
          issues: result.issues.map((issue) => ({
            id: generateId(),
            category: issue.category,
            severity: issue.severity,
            description: issue.description,
            suggestion: issue.suggestion,
            timestamp: issue.timestamp,
          })),
          overallRisk: result.overallRisk,
        };

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
      }
    }

    return NextResponse.json({ scenes, issues: allIssues });
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
