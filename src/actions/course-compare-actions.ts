"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";

// ---------- Types ----------

interface LessonSnapshot {
  id: string;
  title: string;
  contentPreview: string | null;
  videoUrl: string | null;
  sortOrder: number;
  hasAssessment: boolean;
  questionsCount: number;
}

interface AssessmentSnapshot {
  id: string;
  title: string;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number;
  questionsCount: number;
}

interface FieldChange {
  field: string;
  valueA: string;
  valueB: string;
}

interface LessonDiff {
  status: "added" | "removed" | "modified" | "unchanged";
  lessonA: LessonSnapshot | null;
  lessonB: LessonSnapshot | null;
  changes: FieldChange[];
}

interface AssessmentDiff {
  status: "added" | "removed" | "modified" | "unchanged";
  assessmentA: AssessmentSnapshot | null;
  assessmentB: AssessmentSnapshot | null;
  changes: FieldChange[];
}

export interface CourseDiffSummary {
  lessonsAdded: number;
  lessonsRemoved: number;
  lessonsModified: number;
  lessonsUnchanged: number;
  examsAdded: number;
  examsRemoved: number;
  examsModified: number;
  examsUnchanged: number;
}

export interface CourseDiff {
  courseA: { id: string; title: string; teacherName: string };
  courseB: { id: string; title: string; teacherName: string };
  summary: CourseDiffSummary;
  lessons: LessonDiff[];
  exams: AssessmentDiff[];
}

// ---------- compareCourses ----------

export async function compareCourses(courseAId: string, courseBId: string) {
  return withAuth(
    async () => {
      const [courseA, courseB] = await Promise.all([
        loadCourseForComparison(courseAId),
        loadCourseForComparison(courseBId),
      ]);

      if (!courseA) return { success: false as const, error: "courseNotFound" };
      if (!courseB) return { success: false as const, error: "courseNotFound" };

      const lessonDiffs = compareLessons(courseA.lessons, courseB.lessons);
      const examDiffs = compareAssessments(courseA.assessments, courseB.assessments);

      const summary: CourseDiffSummary = {
        lessonsAdded: lessonDiffs.filter((d) => d.status === "added").length,
        lessonsRemoved: lessonDiffs.filter((d) => d.status === "removed").length,
        lessonsModified: lessonDiffs.filter((d) => d.status === "modified").length,
        lessonsUnchanged: lessonDiffs.filter((d) => d.status === "unchanged").length,
        examsAdded: examDiffs.filter((d) => d.status === "added").length,
        examsRemoved: examDiffs.filter((d) => d.status === "removed").length,
        examsModified: examDiffs.filter((d) => d.status === "modified").length,
        examsUnchanged: examDiffs.filter((d) => d.status === "unchanged").length,
      };

      const data: CourseDiff = {
        courseA: {
          id: courseA.id,
          title: courseA.title,
          teacherName: `${courseA.teacher.firstName} ${courseA.teacher.lastName}`,
        },
        courseB: {
          id: courseB.id,
          title: courseB.title,
          teacherName: `${courseB.teacher.firstName} ${courseB.teacher.lastName}`,
        },
        summary,
        lessons: lessonDiffs,
        exams: examDiffs,
      };

      return { success: true as const, data };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getCoursesForComparison ----------

export async function getCoursesForComparison() {
  return withAuth(
    async () => {
      const courses = await prisma.course.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          teacher: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: { lessons: true },
          },
        },
        orderBy: { title: "asc" },
      });

      return { success: true as const, data: courses };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- Helpers ----------

async function loadCourseForComparison(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId, deletedAt: null },
    include: {
      teacher: {
        select: { firstName: true, lastName: true },
      },
      lessons: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          assessment: {
            include: { questions: true },
          },
        },
      },
      assessments: {
        where: { lessonId: null },
        orderBy: { sortOrder: "asc" },
        include: { questions: true },
      },
    },
  });
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().trim();
}

function truncate(str: string, length: number): string {
  return str.length > length ? str.substring(0, length) + "..." : str;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snapshotLesson(lesson: any): LessonSnapshot {
  return {
    id: lesson.id,
    title: lesson.title,
    contentPreview: lesson.content?.substring(0, 200) ?? null,
    videoUrl: lesson.videoUrl,
    sortOrder: lesson.sortOrder,
    hasAssessment: !!lesson.assessment,
    questionsCount: lesson.assessment?.questions.length ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snapshotAssessment(assessment: any): AssessmentSnapshot {
  return {
    id: assessment.id,
    title: assessment.title,
    passingScore: assessment.passingScore,
    timeLimitMin: assessment.timeLimitMin,
    maxAttempts: assessment.maxAttempts,
    questionsCount: assessment.questions.length,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareLessons(lessonsA: any[], lessonsB: any[]): LessonDiff[] {
  const diffs: LessonDiff[] = [];
  const mapA = new Map(lessonsA.map((l) => [normalizeTitle(l.title), l]));
  const mapB = new Map(lessonsB.map((l) => [normalizeTitle(l.title), l]));

  for (const [key, lessonA] of mapA) {
    const lessonB = mapB.get(key);
    if (!lessonB) {
      diffs.push({ status: "removed", lessonA: snapshotLesson(lessonA), lessonB: null, changes: [] });
    } else {
      const changes = compareLessonFields(lessonA, lessonB);
      diffs.push({
        status: changes.length > 0 ? "modified" : "unchanged",
        lessonA: snapshotLesson(lessonA),
        lessonB: snapshotLesson(lessonB),
        changes,
      });
      mapB.delete(key);
    }
  }

  for (const [, lessonB] of mapB) {
    diffs.push({ status: "added", lessonA: null, lessonB: snapshotLesson(lessonB), changes: [] });
  }

  const statusOrder = { removed: 0, modified: 1, added: 2, unchanged: 3 };
  diffs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  return diffs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareAssessments(assessmentsA: any[], assessmentsB: any[]): AssessmentDiff[] {
  const diffs: AssessmentDiff[] = [];
  const mapA = new Map(assessmentsA.map((a) => [normalizeTitle(a.title), a]));
  const mapB = new Map(assessmentsB.map((a) => [normalizeTitle(a.title), a]));

  for (const [key, assessmentA] of mapA) {
    const assessmentB = mapB.get(key);
    if (!assessmentB) {
      diffs.push({ status: "removed", assessmentA: snapshotAssessment(assessmentA), assessmentB: null, changes: [] });
    } else {
      const changes = compareAssessmentFields(assessmentA, assessmentB);
      diffs.push({
        status: changes.length > 0 ? "modified" : "unchanged",
        assessmentA: snapshotAssessment(assessmentA),
        assessmentB: snapshotAssessment(assessmentB),
        changes,
      });
      mapB.delete(key);
    }
  }

  for (const [, assessmentB] of mapB) {
    diffs.push({ status: "added", assessmentA: null, assessmentB: snapshotAssessment(assessmentB), changes: [] });
  }

  const statusOrder = { removed: 0, modified: 1, added: 2, unchanged: 3 };
  diffs.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  return diffs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareLessonFields(a: any, b: any): FieldChange[] {
  const changes: FieldChange[] = [];

  if (a.title !== b.title) {
    changes.push({ field: "title", valueA: a.title, valueB: b.title });
  }
  if (a.content !== b.content) {
    changes.push({
      field: "content",
      valueA: truncate(a.content || "—", 50),
      valueB: truncate(b.content || "—", 50),
    });
  }
  if (a.videoUrl !== b.videoUrl) {
    changes.push({
      field: "video",
      valueA: a.videoUrl ? "yes" : "no",
      valueB: b.videoUrl ? "yes" : "no",
    });
  }

  const hasTestA = !!a.assessment;
  const hasTestB = !!b.assessment;
  if (hasTestA !== hasTestB) {
    changes.push({ field: "test", valueA: hasTestA ? "yes" : "no", valueB: hasTestB ? "yes" : "no" });
  } else if (hasTestA && hasTestB) {
    if (a.assessment.questions.length !== b.assessment.questions.length) {
      changes.push({
        field: "questionCount",
        valueA: `${a.assessment.questions.length}`,
        valueB: `${b.assessment.questions.length}`,
      });
    }
  }

  return changes;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareAssessmentFields(a: any, b: any): FieldChange[] {
  const changes: FieldChange[] = [];

  if (a.title !== b.title) {
    changes.push({ field: "title", valueA: a.title, valueB: b.title });
  }
  if (a.passingScore !== b.passingScore) {
    changes.push({ field: "passingScore", valueA: `${a.passingScore}%`, valueB: `${b.passingScore}%` });
  }
  if (a.timeLimitMin !== b.timeLimitMin) {
    changes.push({
      field: "time",
      valueA: a.timeLimitMin ? `${a.timeLimitMin} min` : "no",
      valueB: b.timeLimitMin ? `${b.timeLimitMin} min` : "no",
    });
  }
  if (a.maxAttempts !== b.maxAttempts) {
    changes.push({ field: "attempts", valueA: `${a.maxAttempts}`, valueB: `${b.maxAttempts}` });
  }
  if (a.questions.length !== b.questions.length) {
    changes.push({ field: "questionCount", valueA: `${a.questions.length}`, valueB: `${b.questions.length}` });
  }

  return changes;
}
