"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination, usePagination } from "@/components/ui/list-pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "@/i18n/navigation";
import { Loader2, Search, UserMinus, ArrowRightLeft } from "lucide-react";
import {
  addStudentsToGroup,
  removeStudentFromGroup,
  moveStudentToGroup,
} from "@/lib/api/groups";
import { useTranslations } from "next-intl";
import { TelegramWriteButton } from "@/components/telegram-write-button";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  // Логин вместо почты (шаг 1 отказа от почты) — опознавательный знак
  // при входе, а не электронный адрес
  login: string | null;
  phone?: string | null;
  isActive?: boolean;
  telegramUsername?: string | null;
}

interface AvailableStudent extends Student {
  currentGroup: string | null;
  /** Уже записан на курс этой группы */
  enrolled: boolean;
}

interface GroupInfo {
  id: string;
  name: string;
}

interface GroupStudentsManagerProps {
  groupId: string;
  courseId: string;
  students: Student[];
  availableStudents: AvailableStudent[];
  otherGroups: GroupInfo[];
}

const fullName = (student: Student) => `${student.firstName} ${student.lastName}`.trim();

const matches = (student: Student, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [fullName(student), student.login ?? "", student.phone ?? ""].some((field) =>
    field.toLowerCase().includes(needle)
  );
};

export function GroupStudentsManager({
  groupId,
  courseId,
  students,
  availableStudents,
  otherGroups,
}: GroupStudentsManagerProps) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [availableQuery, setAvailableQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveStudentId, setMoveStudentId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Student | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>("");

  // Сначала те, кто ни в одной группе — именно их и нужно распределять
  // (план, этап 5-бис, п.3). currentGroup === null покрывает и совсем новых,
  // и уже записанных на курс без группы; API отдаёт список уже
  // отсортированным по имени, порядок внутри каждой части сохраняем стабильно.
  const sortedAvailable = useMemo(() => {
    const ungrouped = availableStudents.filter((s) => s.currentGroup === null);
    const grouped = availableStudents.filter((s) => s.currentGroup !== null);
    return [...ungrouped, ...grouped];
  }, [availableStudents]);

  const visibleAvailable = sortedAvailable.filter((s) => matches(s, availableQuery));
  const visibleStudents = students.filter((s) => matches(s, groupQuery));
  // Поиск сужает список — новый запрос открывает первую страницу
  const availablePages = usePagination(visibleAvailable, availableQuery);
  const groupPages = usePagination(visibleStudents, groupQuery);

  const handleAddStudent = (student: AvailableStudent) => {
    setAddingId(student.id);
    startTransition(async () => {
      const result = await addStudentsToGroup(groupId, [student.id]);
      setAddingId(null);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
      } else {
        toast({ title: t("addCount", { count: 1 }) });
        router.refresh();
      }
    });
  };

  // Два исхода вместо одного: снять группу или отчислить с курса. Разница
  // существенная — в первом случае начисления продолжаются, но уже по дням.
  const handleRemoveStudent = (alsoUnenroll: boolean) => {
    const student = removeTarget;
    if (!student) return;
    setRemoveTarget(null);

    startTransition(async () => {
      const result = await removeStudentFromGroup(groupId, student.id, alsoUnenroll);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
      } else {
        toast({
          title: alsoUnenroll ? t("studentUnenrolled") : t("studentRemovedFromGroup"),
        });
        router.refresh();
      }
    });
  };

  const handleMoveStudent = () => {
    if (!moveStudentId || !targetGroupId) return;

    startTransition(async () => {
      const result = await moveStudentToGroup(moveStudentId, courseId, targetGroupId);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
      } else {
        toast({ title: t("moveStudent") });
        setMoveDialogOpen(false);
        setMoveStudentId(null);
        setTargetGroupId("");
        router.refresh();
      }
    });
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
    <div className="space-y-6">
      {/* Две колонки по образцу курсового экрана записи: слева — кого можно
          добавить, справа — состав группы. Добавление — один клик, без
          модального окна: это неудобно при наборе целой группы (план,
          этап 5-бис, п.2) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("availableStudentsTitle", { count: sortedAvailable.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchBox(availableQuery, setAvailableQuery)}
            <ScrollArea className="h-[420px] rounded-md border">
              {sortedAvailable.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("noAvailableToAdd")}</p>
              ) : visibleAvailable.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("nothingFound")}</p>
              ) : (
                availablePages.pageItems.map((student) => {
                  const busy = isPending && addingId === student.id;
                  return (
                    <button
                      type="button"
                      key={student.id}
                      disabled={isPending}
                      onClick={() => handleAddStudent(student)}
                      className="flex w-full items-center gap-3 border-b p-3 text-left last:border-b-0 hover:bg-muted/50 disabled:opacity-60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName(student)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.login || student.phone || "—"}
                        </p>
                      </div>
                      {/* Чтобы перевод из другой группы не происходил вслепую
                          (план, п.4) */}
                      {student.currentGroup ? (
                        <Badge variant="outline" className="shrink-0">
                          {t("badgeInGroup", { group: student.currentGroup })}
                        </Badge>
                      ) : student.enrolled ? (
                        <Badge variant="secondary" className="shrink-0">
                          {t("badgeOnCourseNoGroup")}
                        </Badge>
                      ) : (
                        <Badge className="shrink-0">{t("badgeNew")}</Badge>
                      )}
                      {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                    </button>
                  );
                })
              )}
            </ScrollArea>
            <ListPagination
              page={availablePages.page}
              totalPages={availablePages.totalPages}
              onPageChange={availablePages.setPage}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("students", { count: students.length })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchBox(groupQuery, setGroupQuery)}
            <ScrollArea className="h-[420px] rounded-md border">
              {students.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("noStudentsInGroup")}</p>
              ) : visibleStudents.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">{t("nothingFound")}</p>
              ) : (
                groupPages.pageItems.map((student) => (
                  <div
                    key={student.id}
                    className="flex items-center gap-2 border-b p-3 last:border-b-0 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{fullName(student)}</p>
                      <p className="truncate text-xs text-muted-foreground">{student.login || "—"}</p>
                    </div>
                    <TelegramWriteButton username={student.telegramUsername} variant="ghost" />
                    {otherGroups.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={isPending}
                        onClick={() => {
                          setMoveStudentId(student.id);
                          setMoveDialogOpen(true);
                        }}
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      disabled={isPending}
                      onClick={() => setRemoveTarget(student)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </ScrollArea>
            <ListPagination
              page={groupPages.page}
              totalPages={groupPages.totalPages}
              onPageChange={groupPages.setPage}
            />
          </CardContent>
        </Card>
      </div>

      {/* Move student dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("moveStudent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm">{t("selectGroup")}</p>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectGroupPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {otherGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleMoveStudent} disabled={!targetGroupId || isPending}>
              {isPending ? tCommon("moving") : t("move")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Убрать из группы или отчислить — исходы разные, поэтому две кнопки,
          а не подтверждение одного действия. */}
      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium">
              {removeTarget ? `${removeTarget.firstName} ${removeTarget.lastName}` : ""}
            </p>
            <p className="text-muted-foreground">{t("removeOnlyGroupHint")}</p>
            <p className="text-muted-foreground">{t("removeUnenrollHint")}</p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={isPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="outline" onClick={() => handleRemoveStudent(false)} disabled={isPending}>
              {t("removeOnlyGroup")}
            </Button>
            <Button
              onClick={() => handleRemoveStudent(true)}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("removeUnenroll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
