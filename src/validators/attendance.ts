import { z } from "zod";
import { AttendanceStatus } from "@/generated/prisma";

const attendanceStatusEnum = z.nativeEnum(AttendanceStatus);

// --- Attendance session schemas ---

export const createAttendanceSessionSchema = z.object({
  courseId: z
    .string()
    .min(1, "Course ID is required"),
  date: z
    .coerce
    .date({ message: "Valid date is required" }),
  note: z
    .string()
    .optional(),
});

export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;

// --- Attendance records update schema ---

const attendanceRecordSchema = z.object({
  studentId: z
    .string()
    .min(1, "Student ID is required"),
  status: attendanceStatusEnum,
  note: z
    .string()
    .optional(),
});

export type AttendanceRecordInput = z.infer<typeof attendanceRecordSchema>;

export const updateAttendanceRecordsSchema = z.object({
  sessionId: z
    .string()
    .min(1, "Session ID is required"),
  records: z
    .array(attendanceRecordSchema)
    .min(1, "At least one attendance record is required"),
});

export type UpdateAttendanceRecordsInput = z.infer<typeof updateAttendanceRecordsSchema>;
