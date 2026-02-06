import Link from "next/link";

export default function ProjectsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">プロジェクト一覧</h1>
        <Link
          href="/projects/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 新規チェック
        </Link>
      </div>
      <div className="text-center py-20 text-gray-400">
        <p>まだプロジェクトがありません</p>
        <p className="text-sm mt-1">「新規チェック」から動画をアップロードしてください</p>
      </div>
    </div>
  );
}
