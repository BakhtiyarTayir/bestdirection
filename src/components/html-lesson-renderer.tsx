"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FRAME_MESSAGE,
  LESSON_FRAME_ID,
  LESSON_FRAME_LAYOUT_EVENT,
  buildLessonFrameSrcdoc,
  type FrameLayoutMessage,
} from "@/lib/lesson-frame";

/**
 * Права песочницы. Осознанно НЕ выдаём allow-same-origin: без него документ
 * урока живёт в отдельном origin и не видит куки, localStorage и DOM самой LMS.
 * allow-modals тоже не выдаём — alert() из урока подвесил бы вкладку.
 */
const SANDBOX =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

interface HtmlLessonRendererProps {
  content: string;
  className?: string;
}

export function HtmlLessonRenderer({ content, className }: HtmlLessonRendererProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);
  const srcDoc = useMemo(
    () => buildLessonFrameSrcdoc(content, LESSON_FRAME_ID),
    [content]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Origin у песочницы opaque ("null"), сверять его бессмысленно —
      // проверяем, что сообщение пришло именно из нашего iframe.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;

      const data = event.data as FrameLayoutMessage | undefined;
      if (!data || data.type !== FRAME_MESSAGE.layout) return;
      if (data.frameId !== LESSON_FRAME_ID) return;

      // Порог гасит дребезг на дробных высотах: iframe меняет высоту → меняется
      // вьюпорт урока → он рапортует снова.
      setHeight((current) =>
        Math.abs(current - data.height) >= 2 ? data.height : current
      );
      window.dispatchEvent(
        new CustomEvent(LESSON_FRAME_LAYOUT_EVENT, { detail: data })
      );
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Прокидываем тему LMS внутрь урока: автор может (но не обязан) на неё реагировать.
  useEffect(() => {
    const root = document.documentElement;

    function sendTheme() {
      frameRef.current?.contentWindow?.postMessage(
        {
          type: FRAME_MESSAGE.theme,
          theme: root.classList.contains("dark") ? "dark" : "light",
        },
        "*"
      );
    }

    const frame = frameRef.current;
    frame?.addEventListener("load", sendTheme);
    const observer = new MutationObserver(sendTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => {
      frame?.removeEventListener("load", sendTheme);
      observer.disconnect();
    };
  }, []);

  return (
    <iframe
      ref={frameRef}
      id={LESSON_FRAME_ID}
      title="lesson"
      srcDoc={srcDoc}
      sandbox={SANDBOX}
      className={cn("w-full border-0 block", className)}
      style={{ height }}
    />
  );
}
