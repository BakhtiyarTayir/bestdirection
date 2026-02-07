"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Check, X, Clock, AlertCircle } from "lucide-react";
import type { AttendanceStatus } from "@/generated/prisma";

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Присутствует",
  ABSENT: "Отсутствует",
  LATE: "Опоздал",
  EXCUSED: "Уважительная",
};

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: "bg-green-100 text-green-800 hover:bg-green-100",
  ABSENT: "bg-red-100 text-red-800 hover:bg-red-100",
  LATE: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  EXCUSED: "bg-blue-100 text-blue-800 hover:bg-blue-100",
};

const STATUS_ICONS: Record<AttendanceStatus, React.ReactNode> = {
  PRESENT: <Check className="h-3 w-3" />,
  ABSENT: <X className="h-3 w-3" />,
  LATE: <Clock className="h-3 w-3" />,
  EXCUSED: <AlertCircle className="h-3 w-3" />,
};

interface AttendanceRecord {
  id: string;
  studentId: string;
  status: AttendanceStatus;
  note?: string | null;
}

interface AttendanceSession {
  id: string;
  date: Date | string;
  note?: string | null;
  records: AttendanceRecord[];
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AttendanceGridProps {
  sessions: AttendanceSession[];
  students: Student[];
  courseId: string;
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}.${month}`;
}

export function AttendanceGrid({
  sessions,
  students,
  courseId,
}: AttendanceGridProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет сессий посещаемости. Создайте первую сессию.
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет записанных студентов на курс.
      </div>
    );
  }

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Build a lookup: sessionId -> studentId -> record
  const recordMap = new Map<string, Map<string, AttendanceRecord>>();
  for (const session of sortedSessions) {
    const studentMap = new Map<string, AttendanceRecord>();
    for (const record of session.records) {
      studentMap.set(record.studentId, record);
    }
    recordMap.set(session.id, studentMap);
  }

  // Calculate statistics per session
  const sessionStats = sortedSessions.map((session) => {
    const studentMap = recordMap.get(session.id);
    if (!studentMap || studentMap.size === 0) return 0;
    let presentCount = 0;
    studentMap.forEach((record) => {
      if (record.status === "PRESENT" || record.status === "LATE") {
        presentCount++;
      }
    });
    return Math.round((presentCount / students.length) * 100);
  });

  return (
    <div className="overflow-x-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
              Студент
            </TableHead>
            {sortedSessions.map((session) => (
              <TableHead key={session.id} className="text-center min-w-[80px]">
                <Link
                  href={`/courses/${courseId}/attendance/${session.id}`}
                  className="hover:underline font-medium"
                  title={session.note ?? undefined}
                >
                  {formatDate(session.date)}
                </Link>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <TableRow key={student.id}>
              <TableCell className="sticky left-0 bg-background z-10 font-medium">
                {student.lastName} {student.firstName}
              </TableCell>
              {sortedSessions.map((session) => {
                const record = recordMap.get(session.id)?.get(student.id);
                return (
                  <TableCell key={session.id} className="text-center">
                    {record ? (
                      <Badge
                        className={`${STATUS_COLORS[record.status]} border-0 gap-1`}
                        title={STATUS_LABELS[record.status]}
                      >
                        {STATUS_ICONS[record.status]}
                        <span className="sr-only">
                          {STATUS_LABELS[record.status]}
                        </span>
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="sticky left-0 bg-muted/50 z-10 font-medium">
              Посещаемость
            </TableCell>
            {sessionStats.map((percent, idx) => (
              <TableCell
                key={sortedSessions[idx].id}
                className="text-center font-medium"
              >
                {percent}%
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
