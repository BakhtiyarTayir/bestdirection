import sanitizeHtml from "sanitize-html";

/**
 * Очистка разметки лендинга (аудит 2.11).
 *
 * Страницы лендинга хранятся как JSON блочного редактора Editor.js, а web
 * рендерит инлайновую разметку через dangerouslySetInnerHTML. Контент заводят
 * только администраторы, но одного скомпрометированного администраторского
 * входа хватило бы, чтобы повесить скрипт на публичный сайт школы.
 *
 * Разрешаем ровно то, что умеет ставить сам редактор: жирный, курсив,
 * подчёркивание, зачёркивание, выделение, перенос строки и ссылку. Ссылки —
 * только http, https, mailto и tel: javascript: и data: исполняются.
 */
const INLINE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["b", "strong", "i", "em", "u", "s", "mark", "code", "br", "a"],
  allowedAttributes: { a: ["href", "title"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Чужие ссылки открываются в новой вкладке без доступа к нашей странице
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener nofollow", target: "_blank" }),
  },
};

/** Одна строка инлайновой разметки. */
export function sanitizeInline(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value, INLINE_OPTIONS);
}

/** Простая строка без разметки вовсе: подписи, заголовки SEO. */
export function sanitizePlain(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
}

interface EditorBlock {
  id?: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface EditorContent {
  time?: number;
  version?: string;
  blocks?: EditorBlock[];
}

type ListItem = { content?: unknown; items?: unknown };

function sanitizeListItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (typeof item === "string") return sanitizeInline(item);
    const entry = (item ?? {}) as ListItem;
    return {
      ...entry,
      content: sanitizeInline(entry.content),
      // Вложенные списки редактор кладёт рекурсивно
      items: Array.isArray(entry.items) ? sanitizeListItems(entry.items) : undefined,
    };
  });
}

/**
 * Чистит документ Editor.js: все поля, которые web выводит как HTML. Блоки
 * неизвестного типа отбрасываются — рендерер их всё равно не показывает, а
 * хранить непроверенную разметку незачем.
 */
export function sanitizeEditorContent(content: unknown): EditorContent | null {
  if (!content || typeof content !== "object") return null;
  const document = content as EditorContent;
  if (!Array.isArray(document.blocks)) return null;

  const blocks = document.blocks.flatMap((block) => {
    const data = (block?.data ?? {}) as Record<string, unknown>;

    switch (block?.type) {
      case "header":
        return [{ ...block, data: { ...data, text: sanitizeInline(data.text) } }];
      case "paragraph":
        return [{ ...block, data: { ...data, text: sanitizeInline(data.text) } }];
      case "list":
        return [{ ...block, data: { ...data, items: sanitizeListItems(data.items) } }];
      case "quote":
        return [
          {
            ...block,
            data: {
              ...data,
              text: sanitizeInline(data.text),
              caption: sanitizeInline(data.caption),
            },
          },
        ];
      case "image": {
        const file = (data.file ?? {}) as { url?: unknown };
        const url = sanitizeUrl(file.url ?? data.url);
        if (!url) return [];
        return [
          {
            ...block,
            data: { ...data, url, file: { ...file, url }, caption: sanitizeInline(data.caption) },
          },
        ];
      }
      case "delimiter":
        return [{ ...block, data: {} }];
      default:
        return [];
    }
  });

  return { ...document, blocks };
}

/** Адрес картинки: только наш /uploads, наши файлы или http(s). */
export function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (url.startsWith("/")) return url.startsWith("//") ? null : url;
  return /^https?:\/\//i.test(url) ? url : null;
}
