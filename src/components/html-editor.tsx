"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { HtmlLessonRenderer } from "@/components/html-lesson-renderer";
import { FileUp, Image as ImageIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { uploadImage } from "@/lib/api/uploads";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface HtmlEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Разрешает загрузку картинок в редакторе. */
  allowImageUpload?: boolean;
}

/**
 * Редактор HTML-урока: автор вставляет готовый документ целиком
 * (например, артефакт из Claude) и сразу видит его в песочнице.
 */
export function HtmlEditor({
  value,
  onChange,
  id,
  allowImageUpload,
}: HtmlEditorProps) {
  const t = useTranslations("htmlLesson");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  /** Превью пересобираем только по переключению вкладки: iframe перезагружается целиком. */
  const [previewContent, setPreviewContent] = useState(value);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === "string") onChange(content);
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [onChange]
  );

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !allowImageUpload) return;

      setIsUploading(true);
      try {
        const result = await uploadImage(file);
        if (!result.success) return;
        const data = result.data;
        if (data.url) {
          // Тег кладём в конец: где ему место в вёрстке, решает автор.
          onChange(`${value}\n<img src="${data.url}" alt="">\n`);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [allowImageUpload, onChange, value]
  );

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center gap-2 border-b p-2">
        <p className="text-xs text-muted-foreground mr-auto">{t("hint")}</p>

        {allowImageUpload && (
          <>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={isUploading}
              onClick={() => imageInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4 mr-2" />
              )}
              {t("uploadImage")}
            </Button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageUpload}
            />
          </>
        )}

        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="h-4 w-4 mr-2" />
          {t("uploadHtml")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      <Tabs
        defaultValue="edit"
        onValueChange={(tab) => {
          if (tab === "preview") setPreviewContent(value);
        }}
      >
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
          <div id={id} className="h-[600px]">
            <Editor
              height="100%"
              defaultLanguage="html"
              value={value}
              onChange={(next) => onChange(next ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                tabSize: 2,
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          {previewContent ? (
            <HtmlLessonRenderer content={previewContent} />
          ) : (
            <p className="p-4 text-muted-foreground text-sm">{t("noPreview")}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
