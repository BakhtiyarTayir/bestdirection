"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { ChevronLeft, ChevronRight } from "lucide-react";

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

interface InstagramReelsProps {
  urls: string[];
  prevLabel: string;
  nextLabel: string;
}

export function InstagramReels({ urls, prevLabel, nextLabel }: InstagramReelsProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // embed.js обрабатывает blockquote при загрузке; при клиентской навигации
  // скрипт уже загружен и надо дёрнуть process() вручную
  useEffect(() => {
    window.instgrm?.Embeds.process();
  }, []);

  const scrollByCard = (dir: -1 | 1) => {
    trackRef.current?.scrollBy({ left: dir * 372, behavior: "smooth" });
  };

  const arrowClass =
    "flex h-11 w-11 items-center justify-center rounded-full bg-[#8C120C] text-white shadow-[0_8px_20px_rgba(140,18,12,0.4)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#a81a12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#191211]";

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {urls.map((url) => (
          <div key={url} className="w-[340px] shrink-0 snap-start">
            <blockquote
              className="instagram-media"
              data-instgrm-permalink={url}
              data-instgrm-version="14"
              style={{ background: "#fff", border: 0, borderRadius: 12, margin: 0, width: "100%" }}
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            </blockquote>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-center gap-3">
        <button type="button" aria-label={prevLabel} onClick={() => scrollByCard(-1)} className={arrowClass}>
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <button type="button" aria-label={nextLabel} onClick={() => scrollByCard(1)} className={arrowClass}>
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <Script
        src="https://www.instagram.com/embed.js"
        strategy="lazyOnload"
        onLoad={() => window.instgrm?.Embeds.process()}
      />
    </div>
  );
}
