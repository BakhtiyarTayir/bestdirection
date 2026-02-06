"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { updateAttendanceRecords } from "@/actions/attendance-actions";
import { Check } from "lucide-react";
import type { AttendanceStatus } from "@prisma/client";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Присутствует" },
  { value: "ABSENT", label: "Отсутствует" },
  { value: "LATE", label: "Опоздал" },
  { value: "EXCUSED", label: "Уважительная" },
];

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ExistingRecord {
  id: string;
  studentId: string;
  status: AttendanceStatus;
  note?: string | null;
}

interface AttendanceMarkingProps {
  sessionId: string;
  students: Student[];
  existingRecords: ExistingRecord[];
}

interface StudentRecord {
  studentId: string;
  status: AttendanceStatus;
  note: string;
}

export function AttendanceMarking({
  sessionId,
  students,
  existingRecords,
}: AttendanceMarkingProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Build initial records from existing data or defaults
  const existingMap = new Map(
    existingRecords.map((r) => [r.studentId, r])
  );

  const [records, setRecords] = useState<StudentRecord[]>(
    students.map((student) => {
      const existing = existingMap.get(student.id);
      return {
        studentId: student.id,
        status: existing?.status ?? "PRESENT",
        note: existing?.note ?? "",
      };
    })
  );

  const updateRecord = (
    studentId: string,
    field: "status" | "note",
    value: string
  ) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.studentId === studentId ? { ...r, [field]: value } : r
      )
    );
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const result = await updateAttendanceRecords({
        sessionId,
        records: records.map((r) => ({
          studentId: r.studentId,
          status: r.status as AttendanceStatus,
          note: r.note.trim() || undefined,
        })),
      });

      if (result.success) {
        toast({
          title: "Сохранено",
          description: "Посещаемость успешно обновлена.",
        });
        router.refresh();
      } else {
        toast({
          title: "Ошибка",
          description: result.error ?? "Не удалось сохранить посещаемость.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Произошла непредвиденная ошибка.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const setAllStatus = (status: AttendanceStatus) => {
    setRecords((prev) => prev.map((r) => ({ ...r, status })));
  };

  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет записанных студентов на курс.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground self-center mr-2">
          Отметить всех:
        </span>
        {STATUS_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant="outline"
            size="sm"
            onClick={() => setAllStatus(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="min-w-[200px]">Студент</TableHead>
              <TableHead className="min-w-[180px]">Статус</TableHead>
              <TableHead className="min-w-[200px]">Примечание</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student, index) => {
              const record = records.find(
                (r) => r.studentId === student.id
              );
              return (
                <TableRow key={student.id}>
                  <TableCell className="text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {student.lastName} {student.firstName}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={record?.status ?? "PRESENT"}
                      onValueChange={(value) =>
                        updateRecord(student.id, "status", value)
                      }
                    >
                      <SelectTrigger className="w-[170px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Примечание..."
                      value={record?.note ?? ""}
                      onChange={(e) =>
                        updateRecord(student.id, "note", e.target.value)
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isLoading}>
          <Check className="mr-2 h-4 w-4" />
          {isLoading ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
