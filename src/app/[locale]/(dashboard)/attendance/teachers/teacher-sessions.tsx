"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { setTeacherAttendance } from "@/lib/api/attendance";
import type { AttendanceStatus } from "@/validators/attendance";

export interface TeacherSessionRow {
  id: string;
  date: string;
  courseTitle: string;
  groupName: string | null;
  teacherId: string;
  teacherName: string;
  status: AttendanceStatus | null;
  note: string | null;
  teacherImplicit: boolean;
}

const UNMARKED = "UNMARKED";

/**
 * Отметки преподавателей списком: сводка отвечает «сколько», здесь видно
 * «какие именно занятия» и здесь же их отмечают. До сих пор отметить педагога
 * можно было только внутри занятия курса, через карточку с учениками.
 *
 * Статус сохраняется сразу при выборе, заметка — по уходу из поля: на каждую
 * строку своя кнопка «сохранить» превратила бы таблицу в частокол кнопок.
 */
export function TeacherSessions({ rows }: { rows: TeacherSessionRow[] }) {
  const t = useTranslations("attendance");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((row) => [row.id, row.note ?? ""]))
  );

  const statusOptions: { value: AttendanceStatus; label: string }[] = [
    { value: "PRESENT", label: t("present") },
    { value: "ABSENT", label: t("absent") },
    { value: "LATE", label: t("late") },
    { value: "EXCUSED", label: t("excused") },
  ];

  const save = async (
    sessionId: string,
    payload: { status?: AttendanceStatus | null; note?: string | null }
  ) => {
    setSavingId(sessionId);
    try {
      const result = await setTeacherAttendance(sessionId, payload);
      if (result.success) {
        toast({ title: t("saved") });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error === "noAccess" ? tErrors("noAccess") : t("saveFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  if (rows.length === 0) {
    return <p className="py-6 text-center text-muted-foreground">{t("noTeacherData")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">{t("sessionDate")}</TableHead>
            <TableHead>{t("title")}</TableHead>
            <TableHead>{t("teacherRow")}</TableHead>
            <TableHead className="min-w-[170px]">{t("statusHeader")}</TableHead>
            <TableHead className="min-w-[200px]">{t("noteHeader")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{formatDate(new Date(row.date))}</TableCell>
              <TableCell>
                <div>{row.courseTitle}</div>
                <div className="text-sm text-muted-foreground">
                  {row.groupName ?? t("allGroups")}
                </div>
              </TableCell>
              <TableCell>
                <div>{row.teacherName}</div>
                {/* Ведущий ещё не записан в занятии: отметка закрепит его */}
                {row.teacherImplicit && (
                  <Badge variant="outline" className="mt-1">
                    {t("teacherByGroup")}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Select
                  value={row.status ?? UNMARKED}
                  disabled={savingId === row.id}
                  onValueChange={(value) =>
                    save(row.id, {
                      status: value === UNMARKED ? null : (value as AttendanceStatus),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNMARKED}>{t("unmarked")}</SelectItem>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  value={notes[row.id] ?? ""}
                  disabled={savingId === row.id}
                  placeholder={t("teacherNotePlaceholder")}
                  onChange={(event) =>
                    setNotes((prev) => ({ ...prev, [row.id]: event.target.value }))
                  }
                  onBlur={() => {
                    const next = (notes[row.id] ?? "").trim();
                    if (next === (row.note ?? "")) return;
                    save(row.id, { note: next || null });
                  }}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
