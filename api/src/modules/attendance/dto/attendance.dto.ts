import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const status = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
const id = z.string().min(1).max(40);

export const createSessionSchema = z.object({
  courseId: id,
  // Календарная дата строкой: Date уехал бы на сутки при UTC-сериализации
  date: dateOnly,
  note: z.string().max(500).optional(),
  groupId: id.optional(),
});

export const updateRecordsSchema = z.object({
  records: z
    .array(z.object({ studentId: id, status, note: z.string().max(500).optional() }))
    .max(500),
  // Отметка преподавателя приходит тем же запросом, что и ученики: для
  // пользователя это одна операция, и разделять её значило бы допустить
  // состояние «учеников отметили, педагога нет».
  // null у поля — «очистить», отсутствие поля — «не менять».
  teacher: z
    .object({
      teacherId: id.nullable().optional(),
      status: status.nullable().optional(),
      note: z.string().max(500).nullable().optional(),
      startedAt: z.string().datetime().nullable().optional(),
      endedAt: z.string().datetime().nullable().optional(),
    })
    .optional(),
});

export const teacherAttendanceSchema = z.object({
  status: status.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const courseQuerySchema = z.object({ courseId: id });
export const studentQuerySchema = z.object({ studentId: id.optional() });
export const teacherReportQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  teacherId: id.optional(),
  locale: z.enum(["uz", "ru"]).default("uz"),
});

export class CreateSessionDto extends createZodDto(createSessionSchema) {}
export class UpdateRecordsDto extends createZodDto(updateRecordsSchema) {}
export class TeacherAttendanceDto extends createZodDto(teacherAttendanceSchema) {}
export class CourseQueryDto extends createZodDto(courseQuerySchema) {}
export class StudentQueryDto extends createZodDto(studentQuerySchema) {}
export class TeacherReportQueryDto extends createZodDto(teacherReportQuerySchema) {}
