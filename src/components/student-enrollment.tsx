"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { enrollStudent, unenrollStudent } from "@/actions/course-actions";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { useTranslations } from "next-intl";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

interface EnrolledStudent extends Student {
  enrolledAt: Date;
  isActive?: boolean;
}

interface StudentEnrollmentProps {
  courseId: string;
  enrolledStudents: EnrolledStudent[];
  availableStudents: Student[];
}

export function StudentEnrollment({
  courseId,
  enrolledStudents,
  availableStudents,
}: StudentEnrollmentProps) {
  const t = useTranslations("enrollment");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");

  const handleEnroll = () => {
    if (!selectedStudentId) return;

    startTransition(async () => {
      const result = await enrollStudent(courseId, selectedStudentId);
      if (result.success) {
        toast({ title: t("studentAdded") });
        setDialogOpen(false);
        setSelectedStudentId("");
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error,
          variant: "destructive",
        });
      }
    });
  };

  const handleUnenroll = (studentId: string, studentName: string) => {
    if (!confirm(t("removeFromCourse"))) return;

    startTransition(async () => {
      const result = await unenrollStudent(courseId, studentId);
      if (result.success) {
        toast({ title: t("studentRemoved") });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error,
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {t("title", { count: enrolledStudents.length })}
        </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              {t("addStudent")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("addStudentTitle")}</DialogTitle>
              <DialogDescription>
                {t("addStudentDescription")}
              </DialogDescription>
            </DialogHeader>
            {availableStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {t("noAvailableStudents")}
              </p>
            ) : (
              <div className="space-y-4">
                <Select
                  value={selectedStudentId}
                  onValueChange={setSelectedStudentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectStudent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStudents.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} ({student.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                onClick={handleEnroll}
                disabled={!selectedStudentId || isPending}
              >
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("enroll")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {enrolledStudents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            {t("noStudentsEnrolled")}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tCommon("firstName")}</TableHead>
                <TableHead>{tCommon("lastName")}</TableHead>
                <TableHead>{tCommon("email")}</TableHead>
                <TableHead>{tCommon("phone")}</TableHead>
                <TableHead>{t("enrollmentDate")}</TableHead>
                <TableHead className="w-[100px]">{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrolledStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>{student.firstName}</TableCell>
                  <TableCell>{student.lastName}</TableCell>
                  <TableCell>{student.email}</TableCell>
                  <TableCell>{student.phone || "---"}</TableCell>
                  <TableCell>
                    {formatDate(student.enrolledAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        handleUnenroll(
                          student.id,
                          `${student.firstName} ${student.lastName}`
                        )
                      }
                      disabled={isPending}
                      title={t("removeFromCourse")}
                    >
                      <UserMinus className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
