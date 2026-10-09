"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { copyText } from "@/lib/copy-text";
import {
  getNeverLoggedInStudents,
  issueStudentPasswords,
  type ApiIssuedPassword,
  type ApiNeverLoggedInStudent,
} from "@/lib/api/users";
import { Copy, Download, KeyRound, Loader2 } from "lucide-react";

const ALL = "all";

interface IssuePasswordsDialogProps {
  branches: { id: string; name: string }[];
  /** Филиал, выбранный на странице, — начальное значение фильтра в диалоге. */
  defaultBranchId?: string;
}

/** CSV для Excel: разделитель «;», UTF-8 с BOM — иначе кириллица и узбекские буквы ломаются. */
function toCsv(rows: ApiIssuedPassword[], headers: string[]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [headers, ...rows.map((r) => [r.fullName, r.login, r.password, r.branch ?? ""])];
  return "﻿" + lines.map((line) => line.map(cell).join(";")).join("\r\n");
}

/**
 * «Выдать пароли» тем, кто ни разу не входил (PLAN-STUDENT-PASSWORDS-2026-10-09.md,
 * 4). Каждому — свой случайный пароль. Список и пароли живут только в памяти
 * диалога; позже пароль виден в карточке каждого ученика.
 */
export function IssuePasswordsDialog({ branches, defaultBranchId }: IssuePasswordsDialogProps) {
  const t = useTranslations("studentAccess");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(defaultBranchId ?? ALL);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<ApiNeverLoggedInStudent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<ApiIssuedPassword[] | null>(null);

  const errorText = (key: string) => (tErrors.has(key) ? tErrors(key) : tErrors("somethingWentWrong"));

  const load = async (branch: string) => {
    setLoading(true);
    const res = await getNeverLoggedInStudents(branch === ALL ? undefined : branch);
    setLoading(false);
    if (!res.success) {
      toast({ variant: "destructive", title: errorText(res.error) });
      return;
    }
    setStudents(res.data.students);
    setSelected(new Set(res.data.students.map((s) => s.id)));
  };

  const openDialog = () => {
    setIssued(null);
    setConfirming(false);
    setBranchId(defaultBranchId ?? ALL);
    setOpen(true);
    void load(defaultBranchId ?? ALL);
  };

  const changeBranch = (value: string) => {
    setBranchId(value);
    setConfirming(false);
    void load(value);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setConfirming(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allChecked = students.length > 0 && selected.size === students.length;
  const toggleAll = (checked: boolean) => {
    setConfirming(false);
    setSelected(checked ? new Set(students.map((s) => s.id)) : new Set());
  };

  const issue = async () => {
    setIssuing(true);
    const res = await issueStudentPasswords([...selected]);
    setIssuing(false);
    setConfirming(false);
    if (!res.success) {
      toast({ variant: "destructive", title: errorText(res.error) });
      return;
    }
    setIssued(res.data);
  };

  const copyAll = async () => {
    if (!issued) return;
    const ok = await copyText(issued.map((r) => `${r.fullName} — ${r.login} — ${r.password}`).join("\n"));
    toast(ok ? { title: t("copied") } : { variant: "destructive", title: t("copyFailed") });
  };

  const downloadCsv = () => {
    if (!issued) return;
    const csv = toCsv(issued, [t("colName"), t("colLogin"), t("colPassword"), t("colBranch")]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `passwords-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={openDialog}>
        <KeyRound className="mr-1 h-4 w-4" aria-hidden="true" />
        {t("issueButton")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{issued ? t("issuedTitle") : t("issueTitle")}</DialogTitle>
            <DialogDescription>{issued ? t("saveNow") : t("issueHint")}</DialogDescription>
          </DialogHeader>

          {issued ? (
            <div className="space-y-3">
              {issued.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("nobodyIssued")}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="px-2 py-1.5">{t("colName")}</th>
                        <th className="px-2 py-1.5">{t("colLogin")}</th>
                        <th className="px-2 py-1.5">{t("colPassword")}</th>
                        <th className="px-2 py-1.5">{t("colBranch")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issued.map((row) => (
                        <tr key={row.login} className="border-t">
                          <td className="px-2 py-1.5">{row.fullName}</td>
                          <td className="px-2 py-1.5 font-mono">{row.login}</td>
                          <td className="px-2 py-1.5 font-mono">{row.password}</td>
                          <td className="px-2 py-1.5">{row.branch ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" onClick={copyAll} disabled={issued.length === 0}>
                  <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("copyAll")}
                </Button>
                <Button type="button" variant="outline" onClick={downloadCsv} disabled={issued.length === 0}>
                  <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("downloadCsv")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("close")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t("warning")}
              </p>

              {branches.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("branch")}</Label>
                  <Select value={branchId} onValueChange={changeBranch}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("allBranches")}</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : students.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("nobody")}</p>
              ) : (
                <div className="rounded-md border">
                  <label className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-sm font-medium">
                    <Checkbox checked={allChecked} onCheckedChange={(value) => toggleAll(value === true)} />
                    {t("selectAll", { count: students.length })}
                  </label>
                  <ul className="max-h-72 divide-y overflow-y-auto">
                    {students.map((student) => (
                      <li key={student.id}>
                        <label className="flex items-start gap-2 px-3 py-2 text-sm">
                          <Checkbox
                            className="mt-0.5"
                            checked={selected.has(student.id)}
                            onCheckedChange={(value) => toggleOne(student.id, value === true)}
                          />
                          <span className="min-w-0">
                            <span className="block">
                              {student.lastName} {student.firstName}
                            </span>
                            <span className="block break-all text-xs text-muted-foreground">
                              {student.login}
                              {student.branch ? ` · ${student.branch.name}` : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {confirming && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                  {t("confirmText", { count: selected.size })}
                </p>
              )}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={issuing}>
                  {t("cancel")}
                </Button>
                {confirming ? (
                  <Button type="button" onClick={issue} disabled={issuing || selected.size === 0}>
                    {issuing && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {t("confirmIssue", { count: selected.size })}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setConfirming(true)} disabled={loading || selected.size === 0}>
                    {t("issue", { count: selected.size })}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
