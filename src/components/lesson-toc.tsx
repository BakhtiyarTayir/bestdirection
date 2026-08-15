"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { parseTocItems, type LessonFormat } from "@/lib/toc";
import {
  LESSON_FRAME_ID,
  LESSON_FRAME_LAYOUT_EVENT,
  type FrameLayoutMessage,
} from "@/lib/lesson-frame";
import { cn } from "@/lib/utils";
import { List, ChevronsRight } from "lucide-react";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { useTranslations } from "next-intl";

interface LessonTOCProps {
  content: string;
  format?: LessonFormat | null;
}

/** Отступ от верха окна, на котором заголовок считается активным. */
const ACTIVE_OFFSET = 96;

export function LessonTOC({ content, format }: LessonTOCProps) {
  const t = useTranslations("toc");
  const isHtml = format === "HTML";
  const headings = useMemo(
    () => parseTocItems(content, isHtml ? "HTML" : "MARKDOWN"),
    [content, isHtml]
  );
  const [activeId, setActiveId] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  /** id заголовка → offsetTop внутри документа урока (только для HTML). */
  const [frameOffsets, setFrameOffsets] = useState<Record<string, number>>({});

  // Markdown: заголовки — обычные узлы страницы, следим за ними напрямую.
  useEffect(() => {
    if (isHtml) return;

    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "0px 0px -80% 0px", threshold: 0 }
    );

    for (const el of elements) {
      observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [headings, isHtml]);

  // HTML: заголовки внутри iframe, до них не дотянуться — iframe сам присылает их позиции.
  useEffect(() => {
    if (!isHtml) return;

    function onLayout(event: Event) {
      const detail = (event as CustomEvent<FrameLayoutMessage>).detail;
      if (!detail?.headings) return;
      setFrameOffsets(
        Object.fromEntries(detail.headings.map((h) => [h.id, h.top]))
      );
    }

    window.addEventListener(LESSON_FRAME_LAYOUT_EVENT, onLayout);
    return () => window.removeEventListener(LESSON_FRAME_LAYOUT_EVENT, onLayout);
  }, [isHtml]);

  /** Позиция заголовка HTML-урока в координатах страницы. */
  const framePageTop = useCallback(
    (id: string): number | null => {
      const frame = document.getElementById(LESSON_FRAME_ID);
      const offset = frameOffsets[id];
      if (!frame || offset === undefined) return null;
      return frame.getBoundingClientRect().top + window.scrollY + offset;
    },
    [frameOffsets]
  );

  // HTML: активный пункт считаем сами — внутри iframe скролла нет, скроллится страница.
  useEffect(() => {
    if (!isHtml || headings.length === 0) return;

    function onScroll() {
      const probe = window.scrollY + ACTIVE_OFFSET;
      let current = "";
      for (const heading of headings) {
        const top = framePageTop(heading.id);
        if (top === null) continue;
        if (top <= probe) current = heading.id;
      }
      setActiveId(current);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [isHtml, headings, framePageTop]);

  const scrollToHeading = useCallback(
    (id: string) => {
      if (!isHtml) {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      const top = framePageTop(id);
      if (top === null) return;
      window.scrollTo({ top: top - 24, behavior: "smooth" });
    },
    [isHtml, framePageTop]
  );

  if (headings.length < 2) return null;

  if (collapsed) {
    return (
      <div className="sticky top-6">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCollapsed(false)}
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{t("showContents")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <nav className="sticky top-6 w-64 max-h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <List className="h-4 w-4" />
          {t("contents")}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setCollapsed(true)}
        >
          <ChevronsRight className="h-3 w-3" />
        </Button>
      </div>
      <ul className="space-y-1 text-sm border-l">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToHeading(heading.id);
              }}
              className={cn(
                "block py-1 border-l-2 -ml-px transition-colors",
                heading.level === 3 ? "pl-6" : "pl-4",
                activeId === heading.id
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
