"use client";

import { useState, useRef, useCallback } from "react";
import { useProjectStore } from "@/stores/useProjectStore";

export function VideoUploader() {
  const draftVideo = useProjectStore((s) => s.draftVideo);
  const setDraftVideo = useProjectStore((s) => s.setDraftVideo);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("video/")) {
        alert("動画ファイルを選択してください");
        return;
      }

      // Create separate URLs: one for playback (kept alive), one for metadata (revoked)
      const localUrl = URL.createObjectURL(file);
      const tempUrl = URL.createObjectURL(file);

      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        setDraftVideo({
          file,
          url: localUrl,
          name: file.name,
          duration: video.duration,
          size: file.size,
        });
        // Store the File object for API upload
        useProjectStore.getState().setVideoFile(file);
        URL.revokeObjectURL(tempUrl);
      };
      video.onerror = () => {
        URL.revokeObjectURL(localUrl);
        URL.revokeObjectURL(tempUrl);
        alert("動画ファイルの読み込みに失敗しました");
      };
      video.src = tempUrl;
    },
    [setDraftVideo]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleRemove = () => {
    if (draftVideo?.url) {
      URL.revokeObjectURL(draftVideo.url);
    }
    setDraftVideo(null);
    useProjectStore.getState().setVideoFile(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (draftVideo) {
    return (
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
        <div className="flex items-start gap-4">
          <div className="relative w-48 h-28 rounded-lg overflow-hidden bg-black flex-shrink-0">
            <video
              src={draftVideo.url}
              className="w-full h-full object-cover"
              muted
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{draftVideo.name}</h3>
            <div className="mt-1 text-sm text-gray-500 space-y-0.5">
              <p>長さ: {formatDuration(draftVideo.duration)}</p>
              <p>サイズ: {formatSize(draftVideo.size)}</p>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="text-gray-400 hover:text-red-500 transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all
        ${isDragging
          ? "border-blue-500 bg-blue-50 scale-[1.02]"
          : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <div className="space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-medium text-gray-700">
            動画をドラッグ&ドロップ
          </p>
          <p className="text-sm text-gray-500 mt-1">
            またはクリックしてファイルを選択
          </p>
        </div>
      </div>
    </div>
  );
}
