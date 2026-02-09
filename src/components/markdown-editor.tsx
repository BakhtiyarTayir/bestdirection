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

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 15,
  id,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        insertMarkdown("**", "**", "жирный текст");
      } else if (mod && e.key === "i") {
        e.preventDefault();
        insertMarkdown("*", "*", "курсив");
      }
    },
    [insertMarkdown]
  );

  const toolbarButtons = [
    { icon: Bold, title: "Жирный (Ctrl+B)", action: () => insertMarkdown("**", "**", "жирный текст") },
    { icon: Italic, title: "Курсив (Ctrl+I)", action: () => insertMarkdown("*", "*", "курсив") },
    { type: "separator" as const },
    { icon: Heading1, title: "Заголовок 1", action: () => insertAtLineStart("# ") },
    { icon: Heading2, title: "Заголовок 2", action: () => insertAtLineStart("## ") },
    { icon: Heading3, title: "Заголовок 3", action: () => insertAtLineStart("### ") },
    { type: "separator" as const },
    { icon: List, title: "Маркированный список", action: () => insertAtLineStart("- ") },
    { icon: ListOrdered, title: "Нумерованный список", action: () => insertAtLineStart("1. ") },
    { type: "separator" as const },
    { icon: Code, title: "Блок кода", action: () => insertMarkdown("\n```\n", "\n```\n", "код") },
    { icon: Table2, title: "Таблица", action: () => insertMarkdown("\n| Заголовок | Заголовок |\n|-----------|----------|\n| ", " | |\n", "ячейка") },
    { icon: Link, title: "Ссылка", action: () => insertMarkdown("[", "](url)", "текст ссылки") },
    { icon: Image, title: "Изображение", action: () => insertMarkdown("![", "](url)", "описание") },
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
            Загрузить .md
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {/* Tabs: Edit / Preview */}
      <Tabs defaultValue="edit">
        <div className="border-b px-2">
          <TabsList className="bg-transparent h-9">
            <TabsTrigger value="edit" className="text-xs">
              Редактирование
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              Просмотр
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
                Нет содержимого для предпросмотра
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
