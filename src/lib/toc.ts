import { slugify } from "@/lib/slugify";

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

/** Собирает заголовки h2/h3 из markdown-конспекта урока. */
export function parseHeadings(content: string): TocItem[] {
  const regex = /^(#{2,3})\s+(.+)$/gm;
  const items: TocItem[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const text = match[2]
      .trim()
      .replace(/\*+/g, "")
      .replace(/_+/g, "")
      .replace(/`/g, "")
      .trim();
    items.push({
      level: match[1].length,
      text,
      id: slugify(text),
    });
  }
  return items;
}

/** Оглавление показываем только если заголовков хотя бы два. */
export function hasToc(content: string): boolean {
  return parseHeadings(content).length >= 2;
}
