"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Send } from "lucide-react";
import { LANGUAGE_CONFIG } from "@/lib/code-runner/config";
import { useTranslations } from "next-intl";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

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
  const t = useTranslations("homework");

  const monacoLanguage = LANGUAGE_CONFIG[language]?.monacoLanguage || "plaintext";

  const handleSubmit = () => {
    if (!code.trim()) return;
    startTransition(async () => {
      await onSubmit(code);
    });
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
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

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t("attemptsLabel")}: {attemptsRemaining}
        </span>
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
  );
}
