"use client";

import { useRef, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code,
  Table2,
  Link,
  Image as ImageIcon,
  FileUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { uploadImage } from "@/lib/api/uploads";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  /** Разрешает загрузку картинок в редакторе. */
  allowImageUpload?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 15,
  id,
  allowImageUpload,
}: MarkdownEditorProps) {
  const t = useTranslations("markdown");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const insertMarkdown = useCallback(
    (before: string, after: string, placeholder: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end);
      const text = selected || placeholder;
      const newValue =
        value.substring(0, start) + before + text + after + value.substring(end);

      onChange(newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        const cursorStart = start + before.length;
        const cursorEnd = cursorStart + text.length;
        textarea.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [value, onChange]
  );

  const insertAtLineStart = useCallback(
    (prefix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const newValue =
        value.substring(0, lineStart) + prefix + value.substring(lineStart);

      onChange(newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length
        );
      });
    },
    [value, onChange]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === "string") {
          onChange(content);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [onChange]
  );

  const sendImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!allowImageUpload) return null;
      const result = await uploadImage(file);
      return result.success ? (result.data.url ?? null) : null;
    },
    [allowImageUpload]
  );

  const insertImageAtCursor = useCallback(
    (file: File) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const loadingPlaceholder = `![${t("uploading")}]()`;
      const before = value.substring(0, start);
      const after = value.substring(start);
      onChange(before + loadingPlaceholder + after);

      sendImage(file).then((url) => {
        if (url) {
          const currentValue = before + loadingPlaceholder + after;
          onChange(currentValue.replace(loadingPlaceholder, `![screenshot](${url})`));
        } else {
          const currentValue = before + loadingPlaceholder + after;
          onChange(currentValue.replace(loadingPlaceholder, ""));
        }
      });
    },
    [value, onChange, sendImage, t]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!allowImageUpload) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) insertImageAtCursor(file);
          return;
        }
      }
    },
    [allowImageUpload, insertImageAtCursor]
  );

  const handleImageFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) insertImageAtCursor(file);
      e.target.value = "";
    },
    [insertImageAtCursor]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        insertMarkdown("**", "**", t("boldPlaceholder"));
      } else if (mod && e.key === "i") {
        e.preventDefault();
        insertMarkdown("*", "*", t("italicPlaceholder"));
      }
    },
    [insertMarkdown, t]
  );

  const openImagePicker = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  return (
    <div className="rounded-md border">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("bold")}
          onClick={() => insertMarkdown("**", "**", t("boldPlaceholder"))}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("italic")}
          onClick={() => insertMarkdown("*", "*", t("italicPlaceholder"))}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("heading1")}
          onClick={() => insertAtLineStart("# ")}
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("heading2")}
          onClick={() => insertAtLineStart("## ")}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("heading3")}
          onClick={() => insertAtLineStart("### ")}
        >
          <Heading3 className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("bulletList")}
          onClick={() => insertAtLineStart("- ")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("numberedList")}
          onClick={() => insertAtLineStart("1. ")}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("codeBlock")}
          onClick={() => insertMarkdown("\n```\n", "\n```\n", t("codePlaceholder"))}
        >
          <Code className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("table")}
          onClick={() =>
            insertMarkdown(
              `\n| ${t("tableHeader")} | ${t("tableHeader")} |\n|-----------|----------|\n| `,
              " | |\n",
              t("tableCell")
            )
          }
        >
          <Table2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("link")}
          onClick={() => insertMarkdown("[", "](url)", t("linkText"))}
        >
          <Link className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8"
          title={t("image")}
          onClick={() => {
            if (allowImageUpload) {
              openImagePicker();
            } else {
              insertMarkdown("![", "](url)", t("imageAlt"));
            }
          }}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="h-4 w-4 mr-2" />
            {t("uploadMd")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
          {allowImageUpload && (
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageFileSelect}
            />
          )}
        </div>
      </div>

      {/* Tabs: Edit / Preview */}
      <Tabs defaultValue="edit">
        <div className="border-b px-2">
          <TabsList className="bg-transparent h-9">
            <TabsTrigger value="edit" className="text-xs">
              {t("editTab")}
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              {t("previewTab")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="mt-0">
          <Textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={rows}
            className="border-0 rounded-none rounded-b-md focus-visible:ring-0 focus-visible:ring-offset-0 resize-y"
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          <div className="p-4 min-h-[240px]">
            {value ? (
              <MarkdownRenderer content={value} />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("noPreview")}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
