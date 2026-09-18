"use client";

import { useState, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Download, Upload, FileSpreadsheet, FileText, Braces, Loader2 } from "lucide-react";
import { importExamFromFile, importTestFromFile } from "@/lib/api/lessons";
import { importHomeworkFromFile } from "@/lib/api/homework";
import { useTranslations } from "next-intl";

// ---------- ExportButton ----------

interface ExportButtonProps {
  type: "test" | "exam" | "homework";
  id: string;
}

export function ExportButton({ type, id }: ExportButtonProps) {
  const t = useTranslations("exportImport");
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: "xlsx" | "csv" | "json") => {
    setLoading(true);
    try {
      const url =
        type === "test"
          ? `/api/v2/assessments/export/test/${id}?format=${format}`
          : type === "exam"
            ? `/api/v2/assessments/export/exam/${id}?format=${format}`
            : `/api/v2/homework/export/${id}`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || t("exportError"));
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] || `export.${format}`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("exportError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {t("export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {type !== "homework" && (
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {t("excel")}
          </DropdownMenuItem>
        )}
        {type !== "homework" && (
          <DropdownMenuItem onClick={() => handleExport("csv")}>
            <FileText className="h-4 w-4 mr-2" />
            {t("csv")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => handleExport("json")}>
          <Braces className="h-4 w-4 mr-2" />
          {t("json")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------- ImportButton ----------

interface ImportButtonProps {
  type: "test" | "exam" | "homework";
  targetId: string;
}

export function ImportButton({ type, targetId }: ImportButtonProps) {
  const t = useTranslations("exportImport");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("selectFile"));
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (type === "homework" && ext !== "json") {
      setError(t("homeworkJsonOnly"));
      return;
    }

    if (type !== "homework" && ext !== "xlsx" && ext !== "csv" && ext !== "json") {
      setError(t("unsupportedFormat"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let result;
      if (type === "test") {
        result = await importTestFromFile(targetId, file);
      } else if (type === "exam") {
        result = await importExamFromFile(targetId, file);
      } else {
        result = await importHomeworkFromFile(targetId, file);
      }

      if (!result.success) {
        setError(result.error || t("importError"));
        return;
      }

      toast({
        title: t("importSuccess"),
        description:
          type === "test"
            ? t("importTestSuccess")
            : type === "exam"
              ? t("importExamSuccess")
              : t("importHomeworkSuccess"),
      });
      setOpen(false);
      router.refresh();
    } catch {
      setError(t("importError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          {tCommon("import")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === "test"
              ? t("importTestTitle")
              : type === "exam"
                ? t("importExamTitle")
                : t("importHomeworkTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {type === "test"
              ? t("importTestDescription")
              : type === "exam"
                ? t("importExamDescription")
                : t("importHomeworkDescription")}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={type === "homework" ? ".json" : ".xlsx,.csv,.json"}
            className="block w-full text-sm text-muted-foreground
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-primary file:text-primary-foreground
              hover:file:bg-primary/90
              cursor-pointer"
            onChange={() => setError(null)}
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleImport} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {t("importButton")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
