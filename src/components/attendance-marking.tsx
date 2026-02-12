"use client";

import { useState, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { useTranslations } from "next-intl";
import type { AttendanceStatus } from "@/validators/attendance";

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
  const t = useTranslations("attendance");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();
  const router = useRouter();

  const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
    { value: "PRESENT", label: t("present") },
    { value: "ABSENT", label: t("absent") },
    { value: "LATE", label: t("late") },
    { value: "EXCUSED", label: t("excused") },
  ];
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "idle">("idle");

  // Build initial records from existing data or defaults
  const existingMap = new Map(
    existingRecords.map((r) => [r.studentId, r])
  );

  const initialRecords = students.map((student) => {
    const existing = existingMap.get(student.id);
    return {
      studentId: student.id,
      status: existing?.status ?? ("PRESENT" as AttendanceStatus),
      note: existing?.note ?? "",
    };
  });

  const [records, setRecords] = useState<StudentRecord[]>(initialRecords);
  const savedRecordsRef = useRef<StudentRecord[]>(initialRecords);

  const updateRecord = (
    studentId: string,
    field: "status" | "note",
    value: string
  ) => {
    setRecords((prev) => {
      const next = prev.map((r) =>
        r.studentId === studentId ? { ...r, [field]: value } : r
      );
      // Check if changed from saved version
      const hasChanges = JSON.stringify(next) !== JSON.stringify(savedRecordsRef.current);
      setSaveStatus(hasChanges ? "unsaved" : "saved");
      return next;
    });
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
        savedRecordsRef.current = records;
        setSaveStatus("saved");
        toast({
          title: t("saved"),
          description: t("attendanceSaved"),
        });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("saveFailed"),
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
      setIsLoading(false);
    }
  };

  const setAllStatus = (status: AttendanceStatus) => {
    setRecords((prev) => {
      const next = prev.map((r) => ({ ...r, status }));
      const hasChanges = JSON.stringify(next) !== JSON.stringify(savedRecordsRef.current);
      setSaveStatus(hasChanges ? "unsaved" : "saved");
      return next;
    });
  };

  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t("noStudentsEnrolled")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground self-center mr-2">
          {t("markAll")}
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
              <TableHead className="min-w-[200px]">{t("student")}</TableHead>
              <TableHead className="min-w-[180px]">{t("statusHeader")}</TableHead>
              <TableHead className="min-w-[200px]">{t("noteHeader")}</TableHead>
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
                      placeholder={t("notePlaceholder")}
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

      <div className="flex items-center justify-end gap-3">
        {saveStatus === "saved" && (
          <Badge variant="outline" className="text-green-600 border-green-600">
            {t("saved")}
          </Badge>
        )}
        {saveStatus === "unsaved" && (
          <Badge variant="outline" className="text-orange-600 border-orange-600">
            {t("unsavedChanges")}
          </Badge>
        )}
        <Button onClick={handleSave} disabled={isLoading}>
          <Check className="mr-2 h-4 w-4" />
          {isLoading ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </div>
  );
}
