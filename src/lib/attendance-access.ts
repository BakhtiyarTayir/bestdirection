/**
 * Кто может вести посещаемость.
 *
 * Преподаватель курса — не единственный, кто ведёт занятия: у группы может быть
 * свой педагог, а конкретное занятие мог провести заменяющий. Проверка только по
 * course.teacherId запирала таких преподавателей: в отчёте их занятия висели
 * «не отмечено», а отметить их они не могли.
 *
 * Чистые функции без обращений к базе: вызывающий уже загрузил нужные поля,
 * а правило можно проверить тестом (scripts/check-attendance-db.ts).
 */

export interface AttendanceActor {
  id: string;
  role: string;
}

interface SessionAccess {
  teacherId: string | null;
  course: { teacherId: string };
  group: { teacherId: string | null } | null;
}

/** Ведущий занятия, педагог его группы или педагог курса */
export function canManageSession(actor: AttendanceActor, session: SessionAccess): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "TEACHER") return false;
  return (
    session.teacherId === actor.id ||
    session.group?.teacherId === actor.id ||
    session.course.teacherId === actor.id
  );
}

/**
 * Право заводить занятия курса: педагог курса или педагог любой его группы.
 * groupId сужает проверку до конкретной группы — для неё достаточно быть её
 * педагогом.
 */
export function canManageCourseAttendance(
  actor: AttendanceActor,
  course: { teacherId: string; groups: { id: string; teacherId: string | null }[] },
  groupId?: string | null
): boolean {
  if (actor.role === "ADMIN") return true;
  if (actor.role !== "TEACHER") return false;
  if (course.teacherId === actor.id) return true;
  const groups = groupId
    ? course.groups.filter((group) => group.id === groupId)
    : course.groups;
  return groups.some((group) => group.teacherId === actor.id);
}
