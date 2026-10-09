"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { downloadCsv } from "@/lib/csv";
import { exportStudentCredentials } from "@/lib/api/users";
import { Download, Loader2 } from "lucide-react";

interface ExportCredentialsButtonProps {
  /** Текущие фильтры страницы — выгрузка берёт тех же учеников, что видны в списке. */
  filters: { branchId?: string; teacherId?: string; courseId?: string; groupId?: string };
}

/** «Скачать логины и пароли»: запрос только по нажатию, пароли в память не кладём. */
export function ExportCredentialsButton({ filters }: ExportCredentialsButtonProps) {
  const t = useTranslations("studentAccess");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const res = await exportStudentCredentials(filters);
    setLoading(false);
    if (!res.success) {
      toast({ variant: "destructive", title: tErrors.has(res.error) ? tErrors(res.error) : tErrors("somethingWentWrong") });
      return;
    }
    if (res.data.length === 0) {
      toast({ title: t("exportEmpty") });
      return;
    }
    downloadCsv(`logins-${new Date().toISOString().slice(0, 10)}.csv`, [
      [t("colName"), t("colLogin"), t("colPassword"), t("colBranch"), t("colGroups")],
      ...res.data.map((r) => [r.fullName, r.login, r.password ?? t("exportUnknown"), r.branch ?? "", r.groups]),
    ]);
  };

  return (
    <Button type="button" variant="outline" onClick={run} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="mr-1 h-4 w-4" aria-hidden="true" />
      )}
      {t("exportButton")}
    </Button>
  );
}
