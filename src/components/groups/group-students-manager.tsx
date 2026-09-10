"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "@/i18n/navigation";
import { UserPlus, UserMinus, ArrowRightLeft } from "lucide-react";
import {
  addStudentsToGroup,
  removeStudentFromGroup,
  moveStudentToGroup,
} from "@/actions/group-actions";
import { useTranslations } from "next-intl";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
  isActive?: boolean;
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
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveStudentId, setMoveStudentId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Student | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>("");

  const handleAddStudents = () => {
    if (selectedStudents.length === 0) return;

    startTransition(async () => {
      const result = await addStudentsToGroup(groupId, selectedStudents);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
      } else {
        toast({ title: t("addCount", { count: selectedStudents.length }) });
        setSelectedStudents([]);
        setAddDialogOpen(false);
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

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t("students", { count: students.length })}
        </h2>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("addStudents")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("addStudentsTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{t("addStudentsHint")}</p>
            {availableStudents.length === 0 ? (
              <p className="text-muted-foreground py-4">
                {t("allStudentsInGroup")}
              </p>
            ) : (
              <div className="space-y-2">
                {availableStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedStudents.includes(student.id)}
                      onCheckedChange={() => toggleStudent(student.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {student.email || student.phone || "—"}
                      </p>
                    </div>
                    {/* Что произойдёт при добавлении: перевод из другой группы,
                        привязка уже записанного или запись на курс с нуля */}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {student.currentGroup
                        ? t("willMoveFrom", { group: student.currentGroup })
                        : student.enrolled
                          ? t("onCourseNoGroup")
                          : t("willEnroll")}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={handleAddStudents}
                disabled={selectedStudents.length === 0 || isPending}
              >
                {isPending ? tCommon("adding") : t("addCount", { count: selectedStudents.length })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>{t("noStudentsInGroup")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {students.map((student) => (
            <Card key={student.id}>
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div>
                  <p className="font-medium text-sm">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{student.email}</p>
                </div>
                <div className="flex gap-1">
                  {otherGroups.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
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
                    className="h-8 w-8 text-destructive"
                    disabled={isPending}
                    onClick={() =>
                      setRemoveTarget(student)
                    }
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
            <Button
              onClick={handleMoveStudent}
              disabled={!targetGroupId || isPending}
            >
              {isPending ? tCommon("moving") : t("move")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Убрать из группы или отчислить — исходы разные, поэтому две кнопки,
          а не подтверждение одного действия. */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("removeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium">
              {removeTarget
                ? `${removeTarget.firstName} ${removeTarget.lastName}`
                : ""}
            </p>
            <p className="text-muted-foreground">{t("removeOnlyGroupHint")}</p>
            <p className="text-muted-foreground">{t("removeUnenrollHint")}</p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleRemoveStudent(false)}
              disabled={isPending}
            >
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
