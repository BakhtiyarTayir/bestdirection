import Image from "next/image";
import type { EditorBlock, EditorContent } from "@/lib/marketing-content";

// Рендер JSON Editor.js в фирменную вёрстку лендинга. Инлайновая разметка
// (b/i/a/br/mark) приходит HTML-строками из редактора; контент создают только
// администраторы, поэтому рендерим как есть.

interface ListItem {
  content?: string;
  items?: ListItem[];
}

function normalizeListItems(items: Array<string | ListItem>): ListItem[] {
  return items.map((item) => (typeof item === "string" ? { content: item } : item));
}

function ListBlock({ items, ordered }: { items: ListItem[]; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`mb-5 space-y-2 pl-6 ${ordered ? "list-decimal" : "list-disc"} marker:text-[#8C120C]`}>
      {items.map((item, i) => (
        <li key={i} className="leading-relaxed">
          <span dangerouslySetInnerHTML={{ __html: item.content ?? "" }} />
          {item.items && item.items.length > 0 && (
            <ListBlock items={normalizeListItems(item.items)} ordered={ordered} />
          )}
        </li>
      ))}
    </Tag>
  );
}

function Block({ block }: { block: EditorBlock }) {
  switch (block.type) {
    case "header": {
      const level = Math.min(Math.max(Number(block.data.level) || 2, 2), 4);
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      const sizes = { h2: "mt-10 text-2xl md:text-3xl", h3: "mt-8 text-xl md:text-2xl", h4: "mt-6 text-lg" };
      return (
        <Tag
          className={`mb-4 font-bold text-[#191211] ${sizes[Tag]}`}
          dangerouslySetInnerHTML={{ __html: String(block.data.text ?? "") }}
        />
      );
    }
    case "paragraph":
      return (
        <p
          className="mb-5 leading-relaxed text-[#33201d]"
          dangerouslySetInnerHTML={{ __html: String(block.data.text ?? "") }}
        />
      );
    case "list": {
      const items = normalizeListItems((block.data.items ?? []) as Array<string | ListItem>);
      return <ListBlock items={items} ordered={block.data.style === "ordered"} />;
    }
    case "image": {
      const url = String(block.data.file?.url ?? block.data.url ?? "");
      if (!url) return null;
      const caption = String(block.data.caption ?? "");
      return (
        <figure className="mb-6">
          <Image
            src={url}
            alt={caption}
            width={1200}
            height={800}
            unoptimized
            className="h-auto w-full rounded-xl shadow-[0_10px_30px_rgba(25,18,17,0.08)]"
          />
          {caption && (
            <figcaption
              className="mt-2 text-center text-sm text-[#6f6660]"
              dangerouslySetInnerHTML={{ __html: caption }}
            />
          )}
        </figure>
      );
    }
    case "quote":
      return (
        <blockquote className="mb-6 rounded-r-lg border-l-4 border-[#F6B93B] bg-[#f9f3e8] px-6 py-4">
          <p
            className="mb-1 leading-relaxed text-[#33201d]"
            dangerouslySetInnerHTML={{ __html: String(block.data.text ?? "") }}
          />
          {block.data.caption ? (
            <cite
              className="text-sm not-italic text-[#6f6660]"
              dangerouslySetInnerHTML={{ __html: String(block.data.caption) }}
            />
          ) : null}
        </blockquote>
      );
    case "delimiter":
      return <div className="my-8 text-center text-2xl tracking-[0.6em] text-[#F6B93B]">•••</div>;
    default:
      return null;
  }
}

export function EditorContentView({ content }: { content: EditorContent | null }) {
  if (!content || !Array.isArray(content.blocks)) return null;
  return (
    <div className="text-[17px]">
      {content.blocks.map((block, i) => (
        <Block key={block.id ?? i} block={block} />
      ))}
    </div>
  );
}
