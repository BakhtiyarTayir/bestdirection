"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Upload } from "lucide-react";
import { LANGUAGE_CONFIG } from "@/lib/code-runner/config";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const FILE_EXTENSIONS: Record<string, string[]> = {
  PYTHON: [".py"],
  JAVASCRIPT: [".js", ".mjs"],
  TYPESCRIPT: [".ts"],
  PHP: [".php"],
  JAVA: [".java"],
  CSHARP: [".cs"],
};

interface CodeEditorProps {
  language: string;
  starterCode?: string | null;
  attemptsRemaining: number;
  onSubmit: (code: string) => Promise<void>;
  disabled?: boolean;
}

export function CodeEditor({
  language,
  starterCode,
  attemptsRemaining,
  onSubmit,
  disabled,
}: CodeEditorProps) {
  const [code, setCode] = useState(starterCode || "");
  const [isPending, startTransition] = useTransition();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const t = useTranslations("homework");

  const monacoLanguage = LANGUAGE_CONFIG[language]?.monacoLanguage || "plaintext";
  const allowedExtensions = FILE_EXTENSIONS[language] || [];
  const acceptString = allowedExtensions.join(",");

  const readFileAsText = useCallback(
    (file: File) => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
        toast({
          title: t("error"),
          description: t("fileTypeError", { extensions: allowedExtensions.join(", ") }),
          variant: "destructive",
        });
        return;
      }

      if (file.size > 100 * 1024) {
        toast({
          title: t("error"),
          description: t("fileTooLarge"),
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          setCode(content);
          toast({ title: t("fileLoaded", { filename: file.name }) });
        }
      };
      reader.readAsText(file);
    },
    [allowedExtensions, toast, t]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) readFileAsText(file);
  };

  const handleSubmit = () => {
    if (!code.trim()) return;
    startTransition(async () => {
      await onSubmit(code);
    });
  };

  return (
    <div className="space-y-4">
      <div
        className={`border rounded-lg overflow-hidden relative transition-colors ${
          isDragOver ? "border-primary border-2 bg-primary/5" : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="h-8 w-8" />
              <span className="text-sm font-medium">{t("dropFileHere")}</span>
            </div>
          </div>
        )}
        <Editor
          height="400px"
          language={monacoLanguage}
          value={code}
          onChange={(value) => setCode(value || "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptString}
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t("attemptsLabel")}: {attemptsRemaining}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || disabled}
          >
            <Upload className="h-4 w-4 mr-2" />
            {t("uploadFile")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || disabled || attemptsRemaining <= 0 || !code.trim()}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isPending ? t("statusRunning") : t("submitSolution")}
          </Button>
        </div>
      </div>
    </div>
  );
}
