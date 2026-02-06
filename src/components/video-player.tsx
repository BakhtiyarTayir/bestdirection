"use client";

import dynamic from "next/dynamic";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface VideoPlayerProps {
  url: string;
  source: "YOUTUBE" | "UPLOAD";
}

export function VideoPlayer({ url, source }: VideoPlayerProps) {
  const playerUrl = source === "YOUTUBE" ? url : url;

  return (
    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
      <ReactPlayer
        url={playerUrl}
        width="100%"
        height="100%"
        controls
        style={{ position: "absolute", top: 0, left: 0 }}
      />
    </div>
  );
}
