import { z } from "zod";

export const AttendanceStatusEnum = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

export type AttendanceStatus = z.infer<typeof AttendanceStatusEnum>;

// --- Attendance session schemas ---

export const createAttendanceSessionSchema = z.object({
  courseId: z
    .string()
    .min(1, "courseIdRequired"),
  date: z
    .coerce
    .date({ message: "invalidDate" }),
  note: z
    .string()
    .optional(),
});

export type CreateAttendanceSessionInput = z.infer<typeof createAttendanceSessionSchema>;

// --- Attendance records update schema ---

const attendanceRecordSchema = z.object({
  studentId: z
    .string()
    .min(1, "studentIdRequired"),
  status: AttendanceStatusEnum,
  note: z
    .string()
    .optional(),
});

export type AttendanceRecordInput = z.infer<typeof attendanceRecordSchema>;

export const updateAttendanceRecordsSchema = z.object({
  sessionId: z
    .string()
    .min(1, "sessionIdRequired"),
  records: z
    .array(attendanceRecordSchema)
    .min(1, "atLeastOneRecord"),
});

export type UpdateAttendanceRecordsInput = z.infer<typeof updateAttendanceRecordsSchema>;
