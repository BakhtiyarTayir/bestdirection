"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useRouter } from "next/navigation";
import { UserPlus, UserMinus, ArrowRightLeft } from "lucide-react";
import {
  addStudentsToGroup,
  removeStudentFromGroup,
  moveStudentToGroup,
} from "@/actions/group-actions";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  isActive?: boolean;
}

interface AvailableStudent extends Student {
  currentGroup: string | null;
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
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveStudentId, setMoveStudentId] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string>("");

  const handleAddStudents = () => {
    if (selectedStudents.length === 0) return;

    startTransition(async () => {
      const result = await addStudentsToGroup(groupId, selectedStudents);
      if (!result.success) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else {
        toast({ title: `Добавлено студентов: ${selectedStudents.length}` });
        setSelectedStudents([]);
        setAddDialogOpen(false);
        router.refresh();
      }
    });
  };

  const handleRemoveStudent = (studentId: string, name: string) => {
    if (!confirm(`Убрать "${name}" из группы? Студент останется записан на курс.`)) return;

    startTransition(async () => {
      const result = await removeStudentFromGroup(groupId, studentId);
      if (!result.success) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Студент убран из группы" });
        router.refresh();
      }
    });
  };

  const handleMoveStudent = () => {
    if (!moveStudentId || !targetGroupId) return;

    startTransition(async () => {
      const result = await moveStudentToGroup(moveStudentId, courseId, targetGroupId);
      if (!result.success) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Студент перемещён" });
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
          Студенты ({students.length})
        </h2>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Добавить студентов
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Добавить студентов в группу</DialogTitle>
            </DialogHeader>
            {availableStudents.length === 0 ? (
              <p className="text-muted-foreground py-4">
                Все записанные студенты уже в этой группе
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
                      <p className="text-xs text-muted-foreground">{student.email}</p>
                    </div>
                    {student.currentGroup && (
                      <span className="text-xs text-muted-foreground">
                        {student.currentGroup}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={handleAddStudents}
                disabled={selectedStudents.length === 0 || isPending}
              >
                {isPending ? "Добавление..." : `Добавить (${selectedStudents.length})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>В этой группе пока нет студентов</p>
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
                      handleRemoveStudent(
                        student.id,
                        `${student.firstName} ${student.lastName}`
                      )
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
            <DialogTitle>Переместить студента</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm">Выберите группу:</p>
              <Select value={targetGroupId} onValueChange={setTargetGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите группу" />
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
              Отмена
            </Button>
            <Button
              onClick={handleMoveStudent}
              disabled={!targetGroupId || isPending}
            >
              {isPending ? "Перемещение..." : "Переместить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
