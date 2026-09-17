"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slugify";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
const InsidePreContext = createContext(false);


interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function getTextContent(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    return getTextContent((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

// Отдельный компонент, а не стрелка в components: внутри нужен useContext, а
// хук вне компонента нарушает правила хуков (react-hooks/rules-of-hooks).
// react-markdown рендерит его как обычный компонент, поведение то же.
function MarkdownCode({ children, className }: { children?: ReactNode; className?: string }) {
  const isInsidePre = useContext(InsidePreContext);
  const isHighlighted = className?.includes("language-");

  // Тип 2: inline `code` внутри текста — без стилей блока
  if (!isInsidePre) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-muted text-sm">
        {children}
      </code>
    );
  }

  // Тип 3: подсвеченный блок кода (```python и т.д.)
  if (isHighlighted) {
    return (
      <code
        className={cn(
          className,
          "block w-full p-4 bg-transparent text-zinc-50 text-sm leading-relaxed"
        )}
      >
        {children}
      </code>
    );
  }

  // Тип 1: plain блок кода без языка (``` без указания языка)
  return (
    <code className="block w-full p-4 text-black bg-muted text-sm leading-relaxed">
      {children}
    </code>
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("prose prose-base max-w-none dark:prose-invert", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h2: ({ children }) => (
            <h2 id={slugify(getTextContent(children))}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 id={slugify(getTextContent(children))}>{children}</h3>
          ),
          pre: ({ children }) => (
            <InsidePreContext.Provider value={true}>
              <pre className="!p-0 w-full overflow-x-auto rounded-md bg-zinc-950">
                {children}
              </pre>
            </InsidePreContext.Provider>
          ),
          code: MarkdownCode,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}