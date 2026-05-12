import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

function slugify(text: string): string {
  const slug = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0400-\u04FF\u0600-\u06FF-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

async function main() {
  console.log("Generating slugs for existing records...\n");

  // 1. Course slugs (globally unique)
  const courses = await prisma.course.findMany({
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  const usedCourseSlugs = new Set<string>();

  for (const course of courses) {
    let slug = slugify(course.title);
    let counter = 0;
    while (usedCourseSlugs.has(slug)) {
      counter++;
      slug = `${slugify(course.title)}-${counter}`;
    }
    usedCourseSlugs.add(slug);
    await prisma.course.update({ where: { id: course.id }, data: { slug } });
    console.log(`  Course: "${course.title}" → ${slug}`);
  }

  // 2. Lesson slugs (unique per course)
  const lessons = await prisma.lesson.findMany({
    select: { id: true, title: true, courseId: true },
    orderBy: { sortOrder: "asc" },
  });
  const usedLessonSlugs = new Map<string, Set<string>>();

  for (const lesson of lessons) {
    if (!usedLessonSlugs.has(lesson.courseId)) {
      usedLessonSlugs.set(lesson.courseId, new Set());
    }
    const courseSet = usedLessonSlugs.get(lesson.courseId)!;
    let slug = slugify(lesson.title);
    let counter = 0;
    while (courseSet.has(slug)) {
      counter++;
      slug = `${slugify(lesson.title)}-${counter}`;
    }
    courseSet.add(slug);
    await prisma.lesson.update({ where: { id: lesson.id }, data: { slug } });
    console.log(`  Lesson: "${lesson.title}" → ${slug}`);
  }

  // 3. Homework slugs (unique per lesson)
  const homeworks = await prisma.homework.findMany({
    select: { id: true, title: true, lessonId: true },
    orderBy: { sortOrder: "asc" },
  });
  const usedHwSlugs = new Map<string, Set<string>>();

  for (const hw of homeworks) {
    if (!usedHwSlugs.has(hw.lessonId)) {
      usedHwSlugs.set(hw.lessonId, new Set());
    }
    const lessonSet = usedHwSlugs.get(hw.lessonId)!;
    let slug = slugify(hw.title);
    let counter = 0;
    while (lessonSet.has(slug)) {
      counter++;
      slug = `${slugify(hw.title)}-${counter}`;
    }
    lessonSet.add(slug);
    await prisma.homework.update({ where: { id: hw.id }, data: { slug } });
    console.log(`  Homework: "${hw.title}" → ${slug}`);
  }

  console.log(
    `\nDone! ${courses.length} courses, ${lessons.length} lessons, ${homeworks.length} homeworks.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
