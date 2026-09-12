"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidateLocalized } from "@/lib/revalidate";
import { createAuditLog, computeChanges } from "@/lib/audit";
import type { CreateGroupInput, UpdateGroupInput } from "@/validators/group";
import { dateInputToDb } from "@/lib/date-only";

// ---------- getCourseGroups ----------
export async function getCourseGroups(courseId: string) {
  return withAuth(async () => {
    const groups = await prisma.group.findMany({
      where: { courseId },
      include: {
        _count: { select: { enrollments: true } },
      },
      orderBy: { sortOrder: "asc" },
    });

    return { success: true as const, data: groups };
  });
}

// ---------- getGroupDetails ----------
export async function getGroupDetails(groupId: string) {
  return withAuth(async () => {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                isActive: true,
              },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });

    if (!group) {
      return { success: false as const, error: "groupNotFound" };
    }

    return { success: true as const, data: group };
  });
}

// ---------- createGroup ----------
export async function createGroup(courseId: string, data: CreateGroupInput) {
  return withAuth(
    async (session) => {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, teacherId: true },
      });

      if (!course) {
        return { success: false as const, error: "courseNotFound" };
      }

      if (session.user.role === "TEACHER" && course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      const existing = await prisma.group.findUnique({
        where: { courseId_name: { courseId, name: data.name } },
      });

      if (existing) {
        return { success: false as const, error: "groupNameExists" };
      }

      const maxSort = await prisma.group.aggregate({
        where: { courseId },
        _max: { sortOrder: true },
      });

      const { startDate, endDate, ...rest } = data;

      const group = await prisma.group.create({
        data: {
          ...rest,
          // Даты группы двигают начисления (см. src/lib/billing.ts), поэтому
          // нормализуем их к полудню UTC — как startsAt у записи и paidAt у оплаты
          startDate: dateInputToDb(startDate) ?? null,
          endDate: dateInputToDb(endDate) ?? null,
          courseId,
          // Не указан явно — ведёт преподаватель курса. Отчёт по занятиям
          // опирается на это поле, и пустое значение выкинуло бы группу из него.
          teacherId: data.teacherId?.trim() ? data.teacherId : course.teacherId,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        },
      });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Group",
        entityId: group.id,
        action: "CREATE",
        metadata: { groupName: group.name, courseId },
      });

      revalidateLocalized(`/courses/${courseId}/groups`);
      return { success: true as const, data: group };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- updateGroup ----------
export async function updateGroup(groupId: string, data: UpdateGroupInput) {
  return withAuth(
    async (session) => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { course: { select: { teacherId: true } } },
      });

      if (!group) {
        return { success: false as const, error: "groupNotFound" };
      }

      if (session.user.role === "TEACHER" && group.course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      if (data.name && data.name !== group.name) {
        const existing = await prisma.group.findUnique({
          where: { courseId_name: { courseId: group.courseId, name: data.name } },
        });
        if (existing) {
          return { success: false as const, error: "groupNameExists" };
        }
      }

      const { startDate, endDate, ...rest } = data;

      const updated = await prisma.group.update({
        where: { id: groupId },
        data: {
          ...rest,
          // undefined — поле не трогаем, "" — очищаем, дата — полдень UTC
          startDate: dateInputToDb(startDate),
          endDate: dateInputToDb(endDate),
          // Пустая строка из формы = «убрать преподавателя», undefined = «не менять»
          teacherId:
            data.teacherId === undefined
              ? undefined
              : data.teacherId.trim() || null,
        },
      });

      const changes = computeChanges(group, updated);
      await createAuditLog({
        userId: session.user.id,
        entityType: "Group",
        entityId: groupId,
        action: "UPDATE",
        changes,
      });

      revalidateLocalized(`/courses/${group.courseId}/groups`);
      return { success: true as const, data: updated };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- deleteGroup ----------
export async function deleteGroup(groupId: string) {
  return withAuth(
    async (session) => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { course: { select: { teacherId: true } } },
      });

      if (!group) {
        return { success: false as const, error: "groupNotFound" };
      }

      if (session.user.role === "TEACHER" && group.course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      // Remove group from enrollments (keep enrollments)
      await prisma.enrollment.updateMany({
        where: { groupId },
        data: { groupId: null },
      });

      await prisma.group.delete({ where: { id: groupId } });

      await createAuditLog({
        userId: session.user.id,
        entityType: "Group",
        entityId: groupId,
        action: "DELETE",
        metadata: { groupName: group.name, courseId: group.courseId },
      });

      revalidateLocalized(`/courses/${group.courseId}/groups`);
      return { success: true as const, data: { id: groupId } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- toggleGroupActive ----------
export async function toggleGroupActive(groupId: string) {
  return withAuth(
    async (session) => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { course: { select: { teacherId: true } } },
      });

      if (!group) {
        return { success: false as const, error: "groupNotFound" };
      }

      if (session.user.role === "TEACHER" && group.course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      const updated = await prisma.group.update({
        where: { id: groupId },
        data: { isActive: !group.isActive },
      });

      revalidateLocalized(`/courses/${group.courseId}/groups`);
      return { success: true as const, data: updated };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- addStudentsToGroup ----------
export async function addStudentsToGroup(groupId: string, studentIds: string[]) {
  return withAuth(
    async (session) => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { course: { select: { id: true, teacherId: true } } },
      });

      if (!group) {
        return { success: false as const, error: "groupNotFound" };
      }

      if (session.user.role === "TEACHER" && group.course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      // Выбор больше не ограничен записанными на курс, поэтому роль и
      // активность проверяем здесь: иначе в группу можно было бы затащить
      // преподавателя или отключённого пользователя.
      const eligible = await prisma.user.findMany({
        where: {
          id: { in: studentIds },
          role: "STUDENT",
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      const eligibleIds = eligible.map((student) => student.id);

      for (const studentId of eligibleIds) {
        const existing = await prisma.enrollment.findUnique({
          where: { studentId_courseId: { studentId, courseId: group.courseId } },
        });

        if (existing) {
          await prisma.enrollment.update({
            where: { studentId_courseId: { studentId, courseId: group.courseId } },
            data: { groupId },
          });
        } else {
          await prisma.enrollment.create({
            data: { studentId, courseId: group.courseId, groupId },
          });
        }
      }

      revalidateLocalized(`/courses/${group.courseId}/groups`);
      return { success: true as const, data: { added: eligibleIds.length } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- removeStudentFromGroup ----------
/**
 * Убрать из группы. По умолчанию студент остаётся на курсе — но уже без
 * расписания, и неполный месяц ему считается по календарным дням. Поэтому
 * администратор выбирает: снять только группу или отчислить совсем.
 */
export async function removeStudentFromGroup(
  groupId: string,
  studentId: string,
  alsoUnenroll = false
) {
  return withAuth(
    async (session) => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { course: { select: { id: true, teacherId: true } } },
      });

      if (!group) {
        return { success: false as const, error: "groupNotFound" };
      }

      if (session.user.role === "TEACHER" && group.course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      if (alsoUnenroll) {
        // Запись удаляется целиком: начисления прекращаются. Принятые оплаты
        // остаются — они привязаны к паре студент+курс, а не к записи.
        await prisma.enrollment.delete({
          where: { studentId_courseId: { studentId, courseId: group.courseId } },
        });
      } else {
        await prisma.enrollment.update({
          where: { studentId_courseId: { studentId, courseId: group.courseId } },
          data: { groupId: null },
        });
      }

      await createAuditLog({
        userId: session.user.id,
        entityType: "Enrollment",
        entityId: `${studentId}:${group.courseId}`,
        action: alsoUnenroll ? "DELETE" : "UPDATE",
        metadata: { groupId, alsoUnenroll },
      });

      revalidateLocalized(`/courses/${group.courseId}/groups`);
      revalidateLocalized("/payments/debtors");
      return { success: true as const, data: { studentId, alsoUnenroll } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- moveStudentToGroup ----------
export async function moveStudentToGroup(
  studentId: string,
  courseId: string,
  toGroupId: string
) {
  return withAuth(
    async (session) => {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { teacherId: true },
      });

      if (!course) {
        return { success: false as const, error: "courseNotFound" };
      }

      if (session.user.role === "TEACHER" && course.teacherId !== session.user.id) {
        return { success: false as const, error: "noAccess" };
      }

      await prisma.enrollment.update({
        where: { studentId_courseId: { studentId, courseId } },
        data: { groupId: toGroupId },
      });

      revalidateLocalized(`/courses/${courseId}/groups`);
      return { success: true as const, data: { studentId, toGroupId } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getUngroupedStudents ----------
export async function getUngroupedStudents(courseId: string) {
  return withAuth(async () => {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId, groupId: null },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
      },
    });

    return { success: true as const, data: enrollments.map((e) => e.student) };
  });
}

// ---------- getGroupStatistics ----------
export async function getGroupStatistics(groupId: string) {
  return withAuth(
    async () => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          course: { select: { id: true, title: true, slug: true } },
          enrollments: {
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      });

      if (!group) {
        return { success: false as const, error: "groupNotFound" };
      }

      const courseId = group.courseId;
      const studentIds = group.enrollments.map((e) => e.student.id);

      if (studentIds.length === 0) {
        return {
          success: true as const,
          data: {
            group: { id: group.id, name: group.name, course: group.course },
            summary: {
              totalStudents: 0,
              avgAttendance: 0,
              avgHomeworkScore: 0,
              avgExamScore: 0,
              totalHomeworks: 0,
              totalAssessments: 0,
              totalSessions: 0,
            },
            students: [],
          },
        };
      }

      const [attendanceSessions, homeworks, assessments] = await Promise.all([
        prisma.attendanceSession.findMany({
          where: { courseId, groupId },
          include: {
            records: {
              where: { studentId: { in: studentIds } },
            },
          },
        }),
        prisma.homework.findMany({
          where: { lesson: { courseId }, isPublished: true },
          include: {
            submissions: {
              where: { studentId: { in: studentIds } },
            },
          },
        }),
        prisma.assessment.findMany({
          where: { courseId, isPublished: true },
          include: {
            attempts: {
              where: { studentId: { in: studentIds }, completedAt: { not: null } },
            },
          },
        }),
      ]);

      const totalSessions = attendanceSessions.length;
      const totalHomeworks = homeworks.length;
      const totalAssessments = assessments.length;

      const students = group.enrollments.map((enrollment) => {
        const student = enrollment.student;

        // Attendance: PRESENT + LATE count as attended
        let attendancePresent = 0;
        for (const session of attendanceSessions) {
          const record = session.records.find((r) => r.studentId === student.id);
          if (record && (record.status === "PRESENT" || record.status === "LATE")) {
            attendancePresent++;
          }
        }
        const attendancePercent =
          totalSessions > 0 ? Math.round((attendancePresent / totalSessions) * 100) : 0;

        // Homework: best finalScore (or manualScore if set) per homework
        let homeworkCompleted = 0;
        let homeworkScoreSum = 0;
        for (const hw of homeworks) {
          const studentSubs = hw.submissions.filter((s) => s.studentId === student.id);
          if (studentSubs.length > 0) {
            homeworkCompleted++;
            const bestScore = Math.max(
              ...studentSubs.map((s) => (s.manualScore !== null ? s.manualScore : s.finalScore))
            );
            homeworkScoreSum += bestScore;
          }
        }
        const homeworkAvgScore =
          homeworkCompleted > 0 ? Math.round(homeworkScoreSum / homeworkCompleted) : 0;

        // Exams: best percentage per assessment
        let examsPassed = 0;
        let examScoreSum = 0;
        for (const assess of assessments) {
          const studentAttempts = assess.attempts.filter((a) => a.studentId === student.id);
          if (studentAttempts.length > 0) {
            examsPassed++;
            const bestPct = Math.max(...studentAttempts.map((a) => a.percentage));
            examScoreSum += bestPct;
          }
        }
        const examAvgScore = examsPassed > 0 ? Math.round(examScoreSum / examsPassed) : 0;

        // Overall: attendance 20%, homework 40%, exams 40%
        const overallScore = Math.round(
          attendancePercent * 0.2 + homeworkAvgScore * 0.4 + examAvgScore * 0.4
        );

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          attendancePercent,
          attendancePresent,
          attendanceTotal: totalSessions,
          homeworkCompleted,
          homeworkTotal: totalHomeworks,
          homeworkAvgScore,
          examsPassed,
          examsTotal: totalAssessments,
          examAvgScore,
          overallScore,
        };
      });

      const avg = (fn: (s: (typeof students)[0]) => number) =>
        students.length > 0
          ? Math.round(students.reduce((sum, s) => sum + fn(s), 0) / students.length)
          : 0;

      return {
        success: true as const,
        data: {
          group: { id: group.id, name: group.name, course: group.course },
          summary: {
            totalStudents: students.length,
            avgAttendance: avg((s) => s.attendancePercent),
            avgHomeworkScore: avg((s) => s.homeworkAvgScore),
            avgExamScore: avg((s) => s.examAvgScore),
            totalHomeworks,
            totalAssessments,
            totalSessions,
          },
          students,
        },
      };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getAvailableStudentsForGroup ----------
export async function getAvailableStudentsForGroup(groupId: string) {
  return withAuth(async () => {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { courseId: true },
    });

    if (!group) {
      return { success: false as const, error: "groupNotFound" };
    }

    // Все активные студенты, кроме уже состоящих в этой группе. Раньше выбор
    // ограничивался записанными на курс, и группу нельзя было наполнить, не
    // записав людей отдельным шагом. Запись создаёт addStudentsToGroup — она
    // это умеет с самого начала.
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        deletedAt: null,
        isActive: true,
        NOT: { enrollments: { some: { groupId } } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        enrollments: {
          where: { courseId: group.courseId },
          select: { group: { select: { name: true } } },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return {
      success: true as const,
      data: students.map((student) => {
        const enrollment = student.enrollments[0];
        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          phone: student.phone,
          // Уже на курсе? В какой группе? Это меняет смысл добавления:
          // запись, перевод из другой группы или просто привязка к группе.
          enrolled: Boolean(enrollment),
          currentGroup: enrollment?.group?.name ?? null,
        };
      }),
    };
  });
}

// ---------- getAllGroups ----------
export async function getAllGroups() {
  return withAuth(
    async (session) => {
      const where = session.user.role === "TEACHER"
        ? { course: { teacherId: session.user.id } }
        : {};

      const groups = await prisma.group.findMany({
        where,
        include: {
          course: { select: { id: true, slug: true, title: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: [{ course: { title: "asc" } }, { sortOrder: "asc" }],
      });

      return { success: true as const, data: groups };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- getTeacherOptions ----------
/** Кандидаты в преподаватели группы: активные пользователи с ролью TEACHER или ADMIN. */
export async function getTeacherOptions() {
  return withAuth(
    async () => {
      const teachers = await prisma.user.findMany({
        // ADMIN включён намеренно: в небольшом центре занятия нередко ведёт
        // сам администратор, и без него список окажется пустым.
        where: { role: { in: ["TEACHER", "ADMIN"] }, isActive: true, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      return { success: true as const, data: teachers };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}
