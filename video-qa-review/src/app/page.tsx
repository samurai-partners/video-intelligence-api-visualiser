import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">Video QA Review</h1>
        <p className="text-lg text-gray-500">
          動画をAIで解析し、ターゲット視聴者に不適切な箇所を自動検出
        </p>
        <Link
          href="/projects/new"
          className="inline-block px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          新しい動画をチェック
        </Link>
      </div>
    </div>
  );
}
