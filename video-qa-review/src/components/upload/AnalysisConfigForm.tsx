"use client";

import { useProjectStore } from "@/stores/useProjectStore";
import type { TargetAudience } from "@/types/project";

const AUDIENCE_OPTIONS: { value: TargetAudience; label: string }[] = [
  { value: "children_3_6", label: "子供（3〜6歳）" },
  { value: "children_7_12", label: "子供（7〜12歳）" },
  { value: "general", label: "一般" },
  { value: "corporate", label: "企業向け" },
  { value: "custom", label: "カスタム" },
];

const LANGUAGE_OPTIONS = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "英語" },
  { value: "zh", label: "中国語" },
  { value: "ko", label: "韓国語" },
];

export function AnalysisConfigForm() {
  const config = useProjectStore((s) => s.draftConfig);
  const updateConfig = useProjectStore((s) => s.updateDraftConfig);
  const projectName = useProjectStore((s) => s.projectName);
  const setProjectName = useProjectStore((s) => s.setProjectName);

  return (
    <div className="space-y-6">
      {/* Project Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          プロジェクト名
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="例: ○○チャンネル第15回"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Target Audience */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ターゲット視聴者
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateConfig({ targetAudience: opt.value })}
              className={`
                px-4 py-2.5 rounded-lg border text-sm font-medium transition-all
                ${config.targetAudience === opt.value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {config.targetAudience === "custom" && (
          <input
            type="text"
            value={config.targetAudienceCustom || ""}
            onChange={(e) => updateConfig({ targetAudienceCustom: e.target.value })}
            placeholder="ターゲット視聴者を入力"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        )}
      </div>

      {/* Video Purpose */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          動画の目的（任意）
        </label>
        <input
          type="text"
          value={config.videoPurpose}
          onChange={(e) => updateConfig({ videoPurpose: e.target.value })}
          placeholder="例: 幼稚園児向けの動物教育動画"
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Language */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          言語
        </label>
        <select
          value={config.language}
          onChange={(e) => updateConfig({ language: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Additional Rules */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          追加ルール（任意）
        </label>
        <textarea
          value={config.additionalRules}
          onChange={(e) => updateConfig({ additionalRules: e.target.value })}
          placeholder="例: 小学2年生以上の漢字は使わない、商品の宣伝を含まない"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
        />
      </div>
    </div>
  );
}
