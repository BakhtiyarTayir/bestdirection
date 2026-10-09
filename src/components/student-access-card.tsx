"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { copyText } from "@/lib/copy-text";
import { getStudentCredentials, setStudentPassword } from "@/lib/api/users";
import { generateClientPassword } from "@/lib/generate-password";
import { Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

interface StudentAccessCardProps {
  userId: string;
  login: string | null;
}

/**
 * Блок «Доступ» в карточке ученика (PLAN-STUDENT-PASSWORDS-2026-10-09.md, 4):
 * логин и пароль, чтобы администратор мог передать их ученику. Пароль
 * подгружается только по нажатию «Показать» — отдельным запросом, который
 * сервер пишет в журнал как просмотр. Страница доступна только ADMIN.
 */
export function StudentAccessCard({ userId, login }: StudentAccessCardProps) {
  const t = useTranslations("studentAccess");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();

  const [password, setPassword] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ login: string; password: string } | null>(null);

  const errorText = (key: string) => (tErrors.has(key) ? tErrors(key) : tErrors("somethingWentWrong"));

  const copy = async (text: string) => {
    const ok = await copyText(text);
    toast(ok ? { title: t("copied") } : { variant: "destructive", title: t("copyFailed") });
  };

  // Пароль берём с сервера один раз и держим; повторное «Показать» без запроса
  const loadPassword = async (): Promise<string | null> => {
    if (password) return password;
    setLoading(true);
    const res = await getStudentCredentials(userId);
    setLoading(false);
    if (!res.success) {
      toast({ variant: "destructive", title: errorText(res.error) });
      return null;
    }
    if (res.data.state === "unknown" || !res.data.password) {
      setUnknown(true);
      return null;
    }
    setPassword(res.data.password);
    return res.data.password;
  };

  const toggle = async () => {
    if (visible) {
      setVisible(false);
      return;
    }
    if (await loadPassword()) setVisible(true);
  };

  const copyPassword = async () => {
    const value = await loadPassword();
    if (value) await copy(value);
  };

  const openDialog = () => {
    setDraft("");
    setFormError(null);
    setIssued(null);
    setDialogOpen(true);
  };

  const save = async () => {
    const value = draft.trim();
    if (value && value.length < 8) {
      setFormError(t("passwordTooShort"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await setStudentPassword(userId, value || undefined);
    setSaving(false);
    if (!res.success) {
      setFormError(errorText(res.error));
      return;
    }
    setIssued(res.data);
    setPassword(res.data.password);
    setUnknown(false);
    setVisible(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-muted-foreground">{t("login")}</span>
          <span className="break-all font-mono">{login ?? "—"}</span>
          {login && (
            <Button type="button" variant="ghost" size="icon" aria-label={t("copyLogin")} onClick={() => copy(login)}>
              <Copy className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-muted-foreground">{t("password")}</span>
          {unknown ? (
            <span className="text-muted-foreground">{t("unknown")}</span>
          ) : (
            <>
              <span className="break-all font-mono">{visible && password ? password : "••••••••"}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={visible ? t("hide") : t("show")}
                onClick={toggle}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : visible ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("copyPassword")}
                onClick={copyPassword}
                disabled={loading}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={openDialog}>
          <KeyRound className="mr-1 h-4 w-4" aria-hidden="true" />
          {t("setPassword")}
        </Button>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{issued ? t("issuedHint") : t("dialogHint")}</DialogDescription>
          </DialogHeader>

          {issued ? (
            <div className="space-y-3">
              <div className="space-y-1 rounded-md border bg-muted px-3 py-2 text-sm">
                <p className="break-all">
                  {t("login")}: <span className="font-mono">{issued.login}</span>
                </p>
                <p className="break-all">
                  {t("password")}: <span className="font-mono">{issued.password}</span>
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  onClick={() => copy(`${t("login")}: ${issued.login}\n${t("password")}: ${issued.password}`)}
                >
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("copyAll")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("close")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="student-new-password">{t("newPassword")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="student-new-password"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t("emptyMeansGenerate")}
                    autoComplete="off"
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" onClick={() => setDraft(generateClientPassword())}>
                    {t("generate")}
                  </Button>
                </div>
                {formError && <p className="text-sm text-destructive">{formError}</p>}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                  {t("cancel")}
                </Button>
                <Button type="button" onClick={save} disabled={saving}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t("save")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
