"use client";

import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

export interface VideoPlayerHandle {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  getVideoElement: () => HTMLVideoElement | null;
}

interface VideoPlayerProps {
  src: string;
  onTimeUpdate?: (currentTime: number) => void;
  overlay?: React.ReactNode;
  width?: number;
  height?: number;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer({ src, onTimeUpdate, overlay, width, height }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoReady, setVideoReady] = useState(false);

    useImperativeHandle(ref, () => ({
      seekTo: (time: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = time;
          // Fire onTimeUpdate immediately so parent state syncs with seek
          onTimeUpdate?.(time);
        }
      },
      play: () => {
        videoRef.current?.play();
      },
      pause: () => {
        videoRef.current?.pause();
      },
      getCurrentTime: () => {
        return videoRef.current?.currentTime || 0;
      },
      getVideoElement: () => {
        return videoRef.current;
      },
    }));

    const handleTimeUpdate = useCallback(() => {
      if (videoRef.current && onTimeUpdate) {
        onTimeUpdate(videoRef.current.currentTime);
      }
    }, [onTimeUpdate]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.addEventListener("timeupdate", handleTimeUpdate);
      return () => video.removeEventListener("timeupdate", handleTimeUpdate);
    }, [handleTimeUpdate]);

    // Signal when video element is ready
    useEffect(() => {
      if (videoRef.current) setVideoReady(true);
    }, []);

    return (
      <div className="relative bg-black" style={{ width: width ? `${width}px` : "100%", height: height ? `${height}px` : "35vh" }}>
        <video
          ref={videoRef}
          src={src}
          controls
          className="w-full h-full object-contain"
          onLoadedMetadata={() => setVideoReady(true)}
        />
        {/* Overlay rendered on top of video, inside the same relative container */}
        {videoReady && overlay}
      </div>
    );
  }
);
