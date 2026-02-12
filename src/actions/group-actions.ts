"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { createAuditLog, computeChanges } from "@/lib/audit";
import type { CreateGroupInput, UpdateGroupInput } from "@/validators/group";

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

      const group = await prisma.group.create({
        data: {
          ...data,
          courseId,
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

      revalidatePath(`/courses/${courseId}/groups`);
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

      const updated = await prisma.group.update({
        where: { id: groupId },
        data,
      });

      const changes = computeChanges(group, updated);
      await createAuditLog({
        userId: session.user.id,
        entityType: "Group",
        entityId: groupId,
        action: "UPDATE",
        changes,
      });

      revalidatePath(`/courses/${group.courseId}/groups`);
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

      revalidatePath(`/courses/${group.courseId}/groups`);
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

      revalidatePath(`/courses/${group.courseId}/groups`);
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

      // For each student: upsert enrollment with groupId
      for (const studentId of studentIds) {
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

      revalidatePath(`/courses/${group.courseId}/groups`);
      return { success: true as const, data: { added: studentIds.length } };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}

// ---------- removeStudentFromGroup ----------
export async function removeStudentFromGroup(groupId: string, studentId: string) {
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

      await prisma.enrollment.update({
        where: { studentId_courseId: { studentId, courseId: group.courseId } },
        data: { groupId: null },
      });

      revalidatePath(`/courses/${group.courseId}/groups`);
      return { success: true as const, data: { studentId } };
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

      revalidatePath(`/courses/${courseId}/groups`);
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

    // Get enrolled students NOT in this group
    const enrollments = await prisma.enrollment.findMany({
      where: {
        courseId: group.courseId,
        OR: [{ groupId: null }, { groupId: { not: groupId } }],
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        group: { select: { name: true } },
      },
    });

    const students = enrollments.map((e) => ({
      ...e.student,
      currentGroup: e.group?.name || null,
    }));

    return { success: true as const, data: students };
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
          course: { select: { id: true, title: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: [{ course: { title: "asc" } }, { sortOrder: "asc" }],
      });

      return { success: true as const, data: groups };
    },
    { roles: ["ADMIN", "TEACHER"] }
  );
}
