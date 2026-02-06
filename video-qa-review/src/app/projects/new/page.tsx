"use client";

import { useRouter } from "next/navigation";
import { useProjectStore } from "@/stores/useProjectStore";
import { VideoUploader } from "@/components/upload/VideoUploader";
import { AnalysisConfigForm } from "@/components/upload/AnalysisConfigForm";
import { generateId } from "@/lib/utils";
import Link from "next/link";

export default function NewProjectPage() {
  const router = useRouter();
  const draftVideo = useProjectStore((s) => s.draftVideo);
  const draftConfig = useProjectStore((s) => s.draftConfig);
  const projectName = useProjectStore((s) => s.projectName);

  const canStart = !!draftVideo;

  const handleStart = () => {
    if (!canStart) return;
    const projectId = generateId();
    router.push(`/projects/${projectId}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← トップに戻る
        </Link>
        <h1 className="text-2xl font-bold mt-2">新しい動画をチェック</h1>
      </div>

      <div className="space-y-8">
        {/* Video Upload */}
        <section>
          <h2 className="text-lg font-semibold mb-3">1. 動画ファイル</h2>
          <VideoUploader />
        </section>

        {/* Config */}
        <section>
          <h2 className="text-lg font-semibold mb-3">2. チェックルール設定</h2>
          <AnalysisConfigForm />
        </section>

        {/* Start Button */}
        <div className="pt-4">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            解析開始
          </button>
          {!draftVideo && (
            <p className="text-sm text-gray-400 text-center mt-2">
              動画ファイルをアップロードしてください
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
