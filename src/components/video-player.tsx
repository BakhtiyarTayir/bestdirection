"use client";

import dynamic from "next/dynamic";
import { useRef, useEffect, useCallback } from "react";
import type ReactPlayerType from "react-player";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface VideoPlayerProps {
  url: string;
  source: "YOUTUBE" | "UPLOAD";
  lessonId?: string;
  initialPosition?: number;
}

export function VideoPlayer({ url, source, lessonId, initialPosition }: VideoPlayerProps) {
  const playerRef = useRef<ReactPlayerType | null>(null);
  const watchTimeRef = useRef(0);
  const lastSaveRef = useRef(0);
  const readyRef = useRef(false);
  const seekedRef = useRef(false);

  const saveProgress = useCallback(() => {
    if (!lessonId) return;
    const current = playerRef.current?.getCurrentTime() ?? 0;
    const payload = JSON.stringify({
      lessonId,
      watchTime: Math.round(watchTimeRef.current),
      lastPosition: Math.round(current),
    });

    navigator.sendBeacon("/api/v1/progress", new Blob([payload], { type: "application/json" }));
  }, [lessonId]);

  // Auto-save every 30s
  useEffect(() => {
    if (!lessonId) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastSaveRef.current >= 30_000) {
        saveProgress();
        lastSaveRef.current = now;
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [lessonId, saveProgress]);

  // Save on page unload
  useEffect(() => {
    if (!lessonId) return;

    const handleBeforeUnload = () => saveProgress();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [lessonId, saveProgress]);

  const handleReady = () => {
    readyRef.current = true;
    if (initialPosition && initialPosition > 0 && !seekedRef.current) {
      seekedRef.current = true;
      playerRef.current?.seekTo(initialPosition, "seconds");
    }
  };

  const handleProgress = (state: { playedSeconds: number }) => {
    watchTimeRef.current = state.playedSeconds;
  };

  return (
    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
      <ReactPlayer
        key={source}
        ref={playerRef}
        url={url}
        width="100%"
        height="100%"
        controls
        onReady={handleReady}
        onProgress={handleProgress}
        progressInterval={1000}
        style={{ position: "absolute", top: 0, left: 0 }}
      />
    </div>
  );
}
