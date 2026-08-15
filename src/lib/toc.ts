import { slugify } from "@/lib/slugify";

export type LessonFormat = "MARKDOWN" | "HTML";

export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export interface HtmlTocItem extends TocItem {
  /** Порядковый номер среди всех h2/h3 в исходнике — включая пустые. */
  domIndex: number;
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

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/** Текст заголовка: снимаем вложенные теги (<code>, <br>, <span>) и базовые сущности. */
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&([a-z]+|#\d+);/gi, (full, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? full)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Собирает заголовки h2/h3 из HTML-конспекта в порядке документа.
 * Порядок важен: тот же индекс используется, чтобы проставить id
 * внутри iframe (см. buildLessonFrameSrcdoc).
 */
export function parseHtmlHeadings(content: string): HtmlTocItem[] {
  const regex = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const items: HtmlTocItem[] = [];
  const used = new Set<string>();
  let domIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    // Считаем все h2/h3 подряд: по этому номеру шим находит узел через
    // querySelectorAll('h2, h3'), и нумерация обязана совпадать с исходником.
    const index = domIndex++;

    const text = stripTags(match[3]);
    // Пустые заголовки (например, <h3 id="exTitle"></h3>, который заполняет
    // скрипт урока) в оглавление не попадают.
    if (!text) continue;

    const existingId = /\bid\s*=\s*["']([^"']+)["']/i.exec(match[2])?.[1];
    let id = existingId || slugify(text);
    if (!existingId) {
      let counter = 1;
      const base = id;
      while (used.has(id)) id = `${base}-${counter++}`;
    }
    used.add(id);

    items.push({ level: Number(match[1]), text, id, domIndex: index });
  }
  return items;
}

export function parseTocItems(content: string, format: LessonFormat = "MARKDOWN"): TocItem[] {
  return format === "HTML" ? parseHtmlHeadings(content) : parseHeadings(content);
}

/** Оглавление показываем только если заголовков хотя бы два. */
export function hasToc(content: string, format: LessonFormat = "MARKDOWN"): boolean {
  return parseTocItems(content, format).length >= 2;
}
