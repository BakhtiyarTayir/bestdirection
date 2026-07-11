"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type EditorJS from "@editorjs/editorjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { saveMarketingPage } from "@/actions/marketing-content-actions";
import type { EditorContent } from "@/lib/marketing-content";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

interface PageRow {
  id: string;
  slug: string;
  titleRu: string;
  titleUz: string;
  contentRu: object | null;
  contentUz: object | null;
  seoTitleRu: string | null;
  seoTitleUz: string | null;
  seoDescRu: string | null;
  seoDescUz: string | null;
  showInFooter: boolean;
  published: boolean;
  sortOrder: number;
}

interface PageEditorProps {
  page: PageRow | null;
}

/**
 * Editor.js живёт вне React-рендера: инстанс создаётся в useEffect на div-холдер
 * и сохраняется через ref при отправке формы. Оба языка смонтированы
 * одновременно (переключение — display:none), чтобы не терять несохранённый ввод.
 */
function useEditor(holderId: string, initial: object | null) {
  const editorRef = useRef<EditorJS | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let destroyed = false;
    let instance: EditorJS | null = null;

    (async () => {
      const [{ default: EditorJSClass }, { default: Header }, { default: List }, { default: ImageTool }, { default: Quote }, { default: Delimiter }] =
        await Promise.all([
          import("@editorjs/editorjs"),
          import("@editorjs/header"),
          import("@editorjs/list"),
          import("@editorjs/image"),
          import("@editorjs/quote"),
          import("@editorjs/delimiter"),
        ]);
      if (destroyed) return;

      instance = new EditorJSClass({
        holder: holderId,
        data: (initial as EditorContent | null) ?? undefined,
        minHeight: 120,
        tools: {
          header: { class: Header as never, config: { levels: [2, 3, 4], defaultLevel: 2 } },
          list: { class: List as never, inlineToolbar: true },
          quote: { class: Quote as never, inlineToolbar: true },
          delimiter: Delimiter as never,
          image: {
            class: ImageTool as never,
            config: {
              uploader: {
                async uploadByFile(file: File) {
                  const formData = new FormData();
                  formData.append("image", file);
                  const res = await fetch("/api/v1/upload/image", { method: "POST", body: formData });
                  if (!res.ok) return { success: 0 };
                  const data = (await res.json()) as { url: string };
                  return { success: 1, file: { url: data.url } };
                },
              },
            },
          },
        },
        onReady: () => setReady(true),
      });
      editorRef.current = instance;
    })();

    return () => {
      destroyed = true;
      instance?.destroy?.();
      editorRef.current = null;
    };
    // Инстанс создаётся один раз; initial меняться после маунта не должен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holderId]);

  return { editorRef, ready };
}

export function PageEditor({ page }: PageEditorProps) {
  const t = useTranslations("landingAdmin");
  const { toast } = useToast();
  const router = useRouter();

  const [slug, setSlug] = useState(page?.slug ?? "");
  const [titleRu, setTitleRu] = useState(page?.titleRu ?? "");
  const [titleUz, setTitleUz] = useState(page?.titleUz ?? "");
  const [seoTitleRu, setSeoTitleRu] = useState(page?.seoTitleRu ?? "");
  const [seoTitleUz, setSeoTitleUz] = useState(page?.seoTitleUz ?? "");
  const [seoDescRu, setSeoDescRu] = useState(page?.seoDescRu ?? "");
  const [seoDescUz, setSeoDescUz] = useState(page?.seoDescUz ?? "");
  const [showInFooter, setShowInFooter] = useState(page?.showInFooter ?? false);
  const [published, setPublished] = useState(page?.published ?? false);
  const [sortOrder, setSortOrder] = useState((page?.sortOrder ?? 0).toString());
  const [lang, setLang] = useState<"ru" | "uz">("ru");
  const [saving, setSaving] = useState(false);

  const ru = useEditor("editor-ru", page?.contentRu ?? null);
  const uz = useEditor("editor-uz", page?.contentUz ?? null);

  const save = async () => {
    setSaving(true);
    try {
      const [contentRu, contentUz] = await Promise.all([
        ru.editorRef.current?.save() ?? null,
        uz.editorRef.current?.save() ?? null,
      ]);
      const result = await saveMarketingPage({
        id: page?.id,
        slug: slug.trim(),
        titleRu: titleRu.trim(),
        titleUz: titleUz.trim(),
        contentRu: contentRu as EditorContent | null,
        contentUz: contentUz as EditorContent | null,
        seoTitleRu: seoTitleRu || null,
        seoTitleUz: seoTitleUz || null,
        seoDescRu: seoDescRu || null,
        seoDescUz: seoDescUz || null,
        showInFooter,
        published,
        sortOrder: Number(sortOrder) || 0,
      });
      if (result.success) {
        toast({ description: t("saved") });
        if (!page) {
          router.replace(`/admin/landing/pages/${result.id}`);
        }
        router.refresh();
      } else {
        const known = ["invalidInput", "slugTaken"];
        toast({
          variant: "destructive",
          description: known.includes(result.error) ? t(result.error as "invalidInput") : t("error"),
        });
      }
    } catch {
      toast({ variant: "destructive", description: t("error") });
    } finally {
      setSaving(false);
    }
  };

  const editorsLoading = !ru.ready || !uz.ready;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/landing?tab=pages">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("pageBack")}
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          {page && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://uportal.uz/${page.slug}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("pageOpen")}
              </a>
            </Button>
          )}
          <Button onClick={save} disabled={saving || !slug.trim() || !titleRu.trim() || !titleUz.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="titleRu">{t("pageTitleRu")}</Label>
          <Input id="titleRu" value={titleRu} onChange={(e) => setTitleRu(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="titleUz">{t("pageTitleUz")}</Label>
          <Input id="titleUz" value={titleUz} onChange={(e) => setTitleUz(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="slug">{t("pageSlug")}</Label>
          <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="o-nas" />
          <p className="text-xs text-muted-foreground">{t("pageSlugHint")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={published} onCheckedChange={setPublished} />
          {t("publishedField")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInFooter} onCheckedChange={setShowInFooter} />
          {t("pageShowInFooter")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t("sortOrderField")}
          <Input
            type="number"
            className="w-20"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </label>
      </div>

      {/* Контент: оба редактора смонтированы, переключаем видимость */}
      <div>
        <div className="mb-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={lang === "ru" ? "default" : "outline"}
            onClick={() => setLang("ru")}
          >
            {t("pageContentRuTab")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={lang === "uz" ? "default" : "outline"}
            onClick={() => setLang("uz")}
          >
            {t("pageContentUzTab")}
          </Button>
        </div>
        {editorsLoading && (
          <p className="mb-2 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            {t("editorLoading")}
          </p>
        )}
        <div className={lang === "ru" ? "" : "hidden"}>
          <div id="editor-ru" className="min-h-[280px] rounded-lg border px-4 py-2 [&_.ce-block__content]:max-w-none [&_.ce-toolbar__content]:max-w-none" />
        </div>
        <div className={lang === "uz" ? "" : "hidden"}>
          <div id="editor-uz" className="min-h-[280px] rounded-lg border px-4 py-2 [&_.ce-block__content]:max-w-none [&_.ce-toolbar__content]:max-w-none" />
        </div>
      </div>

      {/* SEO */}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("pageSeoBlock")}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("pageSeoTitleRu")}</Label>
            <Input value={seoTitleRu} onChange={(e) => setSeoTitleRu(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pageSeoTitleUz")}</Label>
            <Input value={seoTitleUz} onChange={(e) => setSeoTitleUz(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pageSeoDescRu")}</Label>
            <Input value={seoDescRu} onChange={(e) => setSeoDescRu(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("pageSeoDescUz")}</Label>
            <Input value={seoDescUz} onChange={(e) => setSeoDescUz(e.target.value)} />
          </div>
        </div>
      </details>
    </div>
  );
}
