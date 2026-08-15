import { Card, CardContent } from "@/components/ui/card";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { HtmlLessonRenderer } from "@/components/html-lesson-renderer";
import type { LessonFormat } from "@/lib/toc";

interface LessonContentProps {
  content: string;
  format?: LessonFormat | null;
}

/** Конспект урока: markdown в prose-обёртке или HTML-документ в песочнице. */
export function LessonContent({ content, format }: LessonContentProps) {
  // HTML-урок приносит собственный фон и отступы, поэтому карточка без паддингов.
  if (format === "HTML") {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <HtmlLessonRenderer content={content} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 md:p-8">
        <MarkdownRenderer content={content} />
      </CardContent>
    </Card>
  );
}
