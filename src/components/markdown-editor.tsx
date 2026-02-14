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
  Image,
  FileUp,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  imageUploadEndpoint?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 15,
  id,
  imageUploadEndpoint,
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

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!imageUploadEndpoint) return null;
      const formData = new FormData();
      formData.append("image", file);
      try {
        const res = await fetch(imageUploadEndpoint, { method: "POST", body: formData });
        if (!res.ok) return null;
        const data = await res.json();
        return data.url || null;
      } catch {
        return null;
      }
    },
    [imageUploadEndpoint]
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

      uploadImage(file).then((url) => {
        if (url) {
          const currentValue = before + loadingPlaceholder + after;
          onChange(currentValue.replace(loadingPlaceholder, `![screenshot](${url})`));
        } else {
          const currentValue = before + loadingPlaceholder + after;
          onChange(currentValue.replace(loadingPlaceholder, ""));
        }
      });
    },
    [value, onChange, uploadImage, t]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!imageUploadEndpoint) return;
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
    [imageUploadEndpoint, insertImageAtCursor]
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
    [insertMarkdown]
  );

  const toolbarButtons = [
    { icon: Bold, title: t("bold"), action: () => insertMarkdown("**", "**", t("boldPlaceholder")) },
    { icon: Italic, title: t("italic"), action: () => insertMarkdown("*", "*", t("italicPlaceholder")) },
    { type: "separator" as const },
    { icon: Heading1, title: t("heading1"), action: () => insertAtLineStart("# ") },
    { icon: Heading2, title: t("heading2"), action: () => insertAtLineStart("## ") },
    { icon: Heading3, title: t("heading3"), action: () => insertAtLineStart("### ") },
    { type: "separator" as const },
    { icon: List, title: t("bulletList"), action: () => insertAtLineStart("- ") },
    { icon: ListOrdered, title: t("numberedList"), action: () => insertAtLineStart("1. ") },
    { type: "separator" as const },
    { icon: Code, title: t("codeBlock"), action: () => insertMarkdown("\n```\n", "\n```\n", t("codePlaceholder")) },
    { icon: Table2, title: t("table"), action: () => insertMarkdown(`\n| ${t("tableHeader")} | ${t("tableHeader")} |\n|-----------|----------|\n| `, " | |\n", t("tableCell")) },
    { icon: Link, title: t("link"), action: () => insertMarkdown("[", "](url)", t("linkText")) },
    { icon: Image, title: t("image"), action: () => {
      if (imageUploadEndpoint) {
        imageInputRef.current?.click();
      } else {
        insertMarkdown("![", "](url)", t("imageAlt"));
      }
    }},
  ];

  return (
    <div className="rounded-md border">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b p-2">
        {toolbarButtons.map((btn, i) => {
          if ("type" in btn && btn.type === "separator") {
            return <div key={i} className="w-px h-6 bg-border mx-1" />;
          }
          const Icon = btn.icon!;
          return (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              type="button"
              className="h-8 w-8"
              title={btn.title}
              onClick={btn.action}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
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
          {imageUploadEndpoint && (
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
