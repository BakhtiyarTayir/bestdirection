"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { enrollStudent, unenrollStudent } from "@/actions/course-actions";
import { Loader2, Search } from "lucide-react";
import { formatDate } from "@/lib/format-date";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
  isActive?: boolean;
}

interface EnrolledStudent extends Student {
  enrolledAt: Date;
}

interface StudentEnrollmentProps {
  courseId: string;
  enrolledStudents: EnrolledStudent[];
  availableStudents: Student[];
}

const fullName = (student: Student) =>
  `${student.firstName} ${student.lastName}`.trim();

const byName = (a: Student, b: Student) =>
  fullName(a).localeCompare(fullName(b));

export function StudentEnrollment({
  courseId,
  enrolledStudents,
  availableStudents,
}: StudentEnrollmentProps) {
  const t = useTranslations("enrollment");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();

  // Списки держим локально и переносим строки сразу, не дожидаясь сервера:
  // отметить десяток студентов подряд должно быть быстро. При отказе строка
  // возвращается на место, поэтому расхождения с базой не остаётся.
  const [available, setAvailable] = useState<Student[]>(availableStudents);
  const [enrolled, setEnrolled] = useState<EnrolledStudent[]>(enrolledStudents);
  const [availableQuery, setAvailableQuery] = useState("");
  const [enrolledQuery, setEnrolledQuery] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [removeTarget, setRemoveTarget] = useState<EnrolledStudent | null>(null);

  const actionError = (code?: string, fallback?: string) =>
    code && tErrors.has(code) ? tErrors(code) : code || fallback;

  const matches = (student: Student, query: string) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [fullName(student), student.email ?? "", student.phone ?? ""].some(
      (field) => field.toLowerCase().includes(needle)
    );
  };

  const visibleAvailable = available.filter((s) => matches(s, availableQuery));
  const visibleEnrolled = enrolled.filter((s) => matches(s, enrolledQuery));

  const handleEnroll = async (student: Student) => {
    setBusyIds((prev) => [...prev, student.id]);
    setAvailable((prev) => prev.filter((s) => s.id !== student.id));
    setEnrolled((prev) => [...prev, { ...student, enrolledAt: new Date() }]);

    const result = await enrollStudent(courseId, student.id);
    setBusyIds((prev) => prev.filter((id) => id !== student.id));

    if (!result.success) {
      setEnrolled((prev) => prev.filter((s) => s.id !== student.id));
      setAvailable((prev) => [...prev, student].sort(byName));
      toast({
        title: tErrors("error"),
        description: actionError(result.error, t("enrollFailed")),
        variant: "destructive",
      });
    }
  };

  const handleRemove = async (student: EnrolledStudent) => {
    setRemoveTarget(null);
    setBusyIds((prev) => [...prev, student.id]);
    setEnrolled((prev) => prev.filter((s) => s.id !== student.id));
    // Отключённых студентов getAvailableStudents не отдаёт, поэтому и слева
    // их не показываем — иначе список врал бы до перезагрузки страницы.
    if (student.isActive !== false) {
      setAvailable((prev) => [...prev, student].sort(byName));
    }

    const result = await unenrollStudent(courseId, student.id);
    setBusyIds((prev) => prev.filter((id) => id !== student.id));

    if (result.success) {
      toast({ title: t("studentRemoved") });
    } else {
      setAvailable((prev) => prev.filter((s) => s.id !== student.id));
      setEnrolled((prev) => [...prev, student].sort(byName));
      toast({
        title: tErrors("error"),
        description: actionError(result.error, t("removeFailed")),
        variant: "destructive",
      });
    }
  };

  const searchBox = (value: string, onChange: (v: string) => void) => (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="pl-8"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("transferHint")}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("availableTitle", { count: available.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchBox(availableQuery, setAvailableQuery)}
            <ScrollArea className="h-[420px] rounded-md border">
              {available.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("noAvailableStudents")}
                </p>
              ) : visibleAvailable.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("nothingFound")}
                </p>
              ) : (
                visibleAvailable.map((student) => {
                  const busy = busyIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={false}
                        disabled={busy}
                        onCheckedChange={() => handleEnroll(student)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {fullName(student)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.email || student.phone || "—"}
                        </p>
                      </div>
                      {busy && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </label>
                  );
                })
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("title", { count: enrolled.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchBox(enrolledQuery, setEnrolledQuery)}
            <ScrollArea className="h-[420px] rounded-md border">
              {enrolled.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("noStudentsEnrolled")}
                </p>
              ) : visibleEnrolled.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("nothingFound")}
                </p>
              ) : (
                visibleEnrolled.map((student) => {
                  const busy = busyIds.includes(student.id);
                  return (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-3 border-b p-3 last:border-b-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked
                        disabled={busy}
                        onCheckedChange={() => setRemoveTarget(student)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {fullName(student)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.email || student.phone || "—"}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-xs text-muted-foreground"
                        title={t("enrollmentDate")}
                      >
                        {formatDate(student.enrolledAt)}
                      </span>
                      {busy && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </label>
                  );
                })
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeConfirmDescription", {
                name: removeTarget ? fullName(removeTarget) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeTarget && handleRemove(removeTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("removeFromCourse")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
