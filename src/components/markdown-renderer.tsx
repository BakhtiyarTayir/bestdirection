import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slugify";
import type { ReactNode } from "react";

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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
