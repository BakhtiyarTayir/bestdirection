"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { createTemplate, syncTemplates } from "@/actions/sms-actions";
import { TEMPLATE_VARIABLES } from "@/lib/sms/templates";
import { Loader2, RefreshCw, Plus } from "lucide-react";

interface Template {
  id: string;
  title: string;
  textRu: string;
  status: string;
  eskizId: number | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  APPROVED: "default",
  MODERATION: "secondary",
  DRAFT: "outline",
  REJECTED: "destructive",
};

export function TemplatesManager({ templates }: { templates: Template[] }) {
  const t = useTranslations("sms");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [textRu, setTextRu] = useState("");
  const [textUz, setTextUz] = useState("");
  const [submitToEskiz, setSubmitToEskiz] = useState(true);

  const handleSync = () => {
    startTransition(async () => {
      const res = await syncTemplates();
      if (res.success) {
        toast({ title: t("synced", { created: res.data.created, updated: res.data.updated }) });
        router.refresh();
      } else {
        toast({ variant: "destructive", title: res.error ?? tErrors("somethingWentWrong") });
      }
    });
  };

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createTemplate({ title, textRu, textUz: textUz || textRu, submitToEskiz });
      if (res.success) {
        // Ошибку подачи показываем отдельно: шаблон сохранён, повторить можно
        toast({
          title: t("templateCreated"),
          description: res.data.submitError ?? undefined,
          variant: res.data.submitError ? "destructive" : "default",
        });
        setTitle("");
        setTextRu("");
        setTextUz("");
        setOpen(false);
        router.refresh();
      } else {
        toast({ variant: "destructive", title: tErrors(res.error ?? "somethingWentWrong") });
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">{t("templates")}</CardTitle>
          <CardDescription>{t("templatesDescription")}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={pending}>
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {t("syncTemplates")}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("newTemplate")}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {templates.map((tpl) => (
              <li key={tpl.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{tpl.title}</span>
                  <Badge variant={STATUS_VARIANT[tpl.status] ?? "outline"}>
                    {t(`status.${tpl.status}`)}
                  </Badge>
                  {tpl.eskizId && (
                    <span className="font-mono text-xs text-muted-foreground">
                      eskiz #{tpl.eskizId}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{tpl.textRu}</p>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-title">{t("templateTitle")}</Label>
              <Input id="tpl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-ru">{t("templateTextRu")}</Label>
              <textarea
                id="tpl-ru"
                value={textRu}
                onChange={(e) => setTextRu(e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                {t("variablesHint", { vars: TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(", ") })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-uz">{t("templateTextUz")}</Label>
              <textarea
                id="tpl-uz"
                value={textUz}
                onChange={(e) => setTextUz(e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tpl-submit" checked={submitToEskiz} onCheckedChange={setSubmitToEskiz} />
              <Label htmlFor="tpl-submit" className="font-normal">
                {t("submitToEskiz")}
              </Label>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={handleCreate} disabled={pending || !title.trim() || !textRu.trim()}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {tCommon("save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
