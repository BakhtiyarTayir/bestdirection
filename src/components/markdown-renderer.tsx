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
          pre: ({ children }) => (
            <pre className="!p-0 w-full overflow-x-auto rounded-md bg-zinc-950">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (!isBlock) {
              return <code className="px-3 py-3 rounded block w-full p-4 bg-black text-zinc-50 text-sm leading-relaxed">{children}</code>;
            }
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
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
