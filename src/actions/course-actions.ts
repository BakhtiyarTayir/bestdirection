"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ---------- getCourses ----------
export async function getCourses() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    const userId = session.user.id;

    let courses;

    if (role === "ADMIN") {
      courses = await prisma.course.findMany({
        include: {
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });
    } else if (role === "TEACHER") {
      courses = await prisma.course.findMany({
        where: { teacherId: userId },
        include: {
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });
    } else {
      // STUDENT: only enrolled published courses
      courses = await prisma.course.findMany({
        where: {
          isPublished: true,
          enrollments: {
            some: { studentId: userId },
          },
        },
        include: {
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
              lessons: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      });
    }

    return { success: true, data: courses };
  } catch (error) {
    console.error("getCourses error:", error);
    return { success: false, error: "Failed to fetch courses" };
  }
}

// ---------- getCourseById ----------
export async function getCourseById(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            lessons: true,
          },
        },
      },
    });

    if (!course) return { success: false, error: "Course not found" };

    return { success: true, data: course };
  } catch (error) {
    console.error("getCourseById error:", error);
    return { success: false, error: "Failed to fetch course" };
  }
}

// ---------- createCourse ----------
export async function createCourse(data: {
  title: string;
  description?: string;
  teacherId: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Teachers can only create courses for themselves
    if (role === "TEACHER" && data.teacherId !== session.user.id) {
      return { success: false, error: "Teachers can only create courses for themselves" };
    }

    const course = await prisma.course.create({
      data: {
        title: data.title,
        description: data.description,
        teacherId: data.teacherId,
      },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    revalidatePath("/dashboard/courses");
    return { success: true, data: course };
  } catch (error) {
    console.error("createCourse error:", error);
    return { success: false, error: "Failed to create course" };
  }
}

// ---------- updateCourse ----------
export async function updateCourse(
  id: string,
  data: {
    title?: string;
    description?: string;
    isPublished?: boolean;
    sortOrder?: number;
  }
) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Teachers can only update their own courses
    if (role === "TEACHER") {
      const existing = await prisma.course.findUnique({ where: { id } });
      if (!existing) return { success: false, error: "Course not found" };
      if (existing.teacherId !== session.user.id) {
        return { success: false, error: "You can only update your own courses" };
      }
    }

    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    revalidatePath("/dashboard/courses");
    revalidatePath(`/dashboard/courses/${id}`);
    return { success: true, data: course };
  } catch (error) {
    console.error("updateCourse error:", error);
    return { success: false, error: "Failed to update course" };
  }
}

// ---------- deleteCourse ----------
export async function deleteCourse(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN") return { success: false, error: "Forbidden" };

    await prisma.course.delete({ where: { id } });

    revalidatePath("/dashboard/courses");
    return { success: true };
  } catch (error) {
    console.error("deleteCourse error:", error);
    return { success: false, error: "Failed to delete course" };
  }
}

// ---------- enrollStudent ----------
export async function enrollStudent(courseId: string, studentId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Verify the student exists and has STUDENT role
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    if (!student || student.role !== "STUDENT") {
      return { success: false, error: "Student not found" };
    }

    // Teachers can only enroll students in their own courses
    if (role === "TEACHER") {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return { success: false, error: "Course not found" };
      if (course.teacherId !== session.user.id) {
        return { success: false, error: "You can only enroll students in your own courses" };
      }
    }

    // Check if already enrolled
    const existing = await prisma.enrollment.findUnique({
      where: {
        studentId_courseId: { studentId, courseId },
      },
    });

    if (existing) {
      return { success: false, error: "Student is already enrolled in this course" };
    }

    const enrollment = await prisma.enrollment.create({
      data: { studentId, courseId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    revalidatePath(`/dashboard/courses/${courseId}`);
    return { success: true, data: enrollment };
  } catch (error) {
    console.error("enrollStudent error:", error);
    return { success: false, error: "Failed to enroll student" };
  }
}

// ---------- unenrollStudent ----------
export async function unenrollStudent(courseId: string, studentId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Teachers can only unenroll students from their own courses
    if (role === "TEACHER") {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return { success: false, error: "Course not found" };
      if (course.teacherId !== session.user.id) {
        return { success: false, error: "You can only unenroll students from your own courses" };
      }
    }

    await prisma.enrollment.delete({
      where: {
        studentId_courseId: { studentId, courseId },
      },
    });

    revalidatePath(`/dashboard/courses/${courseId}`);
    return { success: true };
  } catch (error) {
    console.error("unenrollStudent error:", error);
    return { success: false, error: "Failed to unenroll student" };
  }
}

// ---------- getEnrolledStudents ----------
export async function getEnrolledStudents(courseId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
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
      orderBy: { createdAt: "asc" },
    });

    const students = enrollments.map((e) => ({
      ...e.student,
      enrolledAt: e.createdAt,
    }));

    return { success: true, data: students };
  } catch (error) {
    console.error("getEnrolledStudents error:", error);
    return { success: false, error: "Failed to fetch enrolled students" };
  }
}

// ---------- getAvailableStudents ----------
export async function getAvailableStudents(courseId: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const role = session.user.role;
    if (role !== "ADMIN" && role !== "TEACHER") {
      return { success: false, error: "Forbidden" };
    }

    // Get students NOT enrolled in this course
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        isActive: true,
        enrollments: {
          none: { courseId },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
      orderBy: { firstName: "asc" },
    });

    return { success: true, data: students };
  } catch (error) {
    console.error("getAvailableStudents error:", error);
    return { success: false, error: "Failed to fetch available students" };
  }
}
