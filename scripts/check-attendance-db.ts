/**
 * Проверка посещаемости: правило доступа и защита от дублей занятий.
 *   ATTENDANCE_DB_TEST_URL=postgresql://bd:bd@localhost:5439/bd npm run check:attendance-db
 *
 * Правило «кто может вести посещаемость» вынесено чистой функцией именно ради
 * этих проверок: в экшене за withAuth его из скрипта не вызвать. Защита от
 * дублей — частичный уникальный индекс, его видно только на настоящей базе.
 *
 * Скрипт создаёт данные и не убирает их — только одноразовая база. Поэтому
 * отдельная переменная, а не DATABASE_URL из .env, и только localhost:
 *   docker run -d --rm --name bd-test -e POSTGRES_USER=bd -e POSTGRES_PASSWORD=bd \
 *     -e POSTGRES_DB=bd -p 5439:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://bd:bd@localhost:5439/bd npx prisma migrate deploy
 */

const url = process.env.ATTENDANCE_DB_TEST_URL;
if (!url || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error(
    "Нужна ATTENDANCE_DB_TEST_URL на одноразовую базу на localhost — см. комментарий в начале файла."
  );
  process.exit(1);
}
process.env.DATABASE_URL = url;

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? ` = ${a}` : `\n       ожидалось ${e}\n       получено  ${a}`}`);
}

async function main() {
  const { prisma, prismaUnscoped } = await import("../src/lib/prisma");
  const { canManageCourseAttendance, canManageSession } = await import(
    "../src/lib/attendance-access"
  );

  console.log("── кто может вести занятие ──");
  const admin = { id: "admin", role: "ADMIN" };
  const courseTeacher = { id: "course-teacher", role: "TEACHER" };
  const groupTeacher = { id: "group-teacher", role: "TEACHER" };
  const substitute = { id: "substitute", role: "TEACHER" };
  const stranger = { id: "stranger", role: "TEACHER" };
  const student = { id: "student", role: "STUDENT" };

  const session = {
    teacherId: substitute.id,
    course: { teacherId: courseTeacher.id },
    group: { teacherId: groupTeacher.id },
  };

  check("администратор — да", canManageSession(admin, session), true);
  check("преподаватель курса — да", canManageSession(courseTeacher, session), true);
  check("преподаватель группы — да", canManageSession(groupTeacher, session), true);
  check("заменяющий, записанный ведущим, — да", canManageSession(substitute, session), true);
  check("посторонний преподаватель — нет", canManageSession(stranger, session), false);
  check("ученик — нет", canManageSession(student, session), false);
  check(
    "занятие без группы: педагог группы уже ни при чём",
    canManageSession(groupTeacher, { ...session, teacherId: null, group: null }),
    false
  );

  console.log("\n── кто может заводить занятия курса ──");
  const course = {
    teacherId: courseTeacher.id,
    groups: [
      { id: "g1", teacherId: groupTeacher.id },
      { id: "g2", teacherId: stranger.id },
    ],
  };
  check("преподаватель курса — да", canManageCourseAttendance(courseTeacher, course), true);
  check("педагог своей группы — да", canManageCourseAttendance(groupTeacher, course, "g1"), true);
  check("педагог чужой группы — нет", canManageCourseAttendance(groupTeacher, course, "g2"), false);
  // Занятие без группы относится ко всему курсу, поэтому его вправе завести
  // педагог любой его группы, а не только педагог курса
  check(
    "занятие без группы заводит педагог любой группы курса",
    canManageCourseAttendance(groupTeacher, course, null),
    true
  );
  check("посторонний — нет", canManageCourseAttendance({ id: "nobody", role: "TEACHER" }, course), false);

  console.log("\n── защита от дублей занятий ──");
  const run = Date.now().toString(36);
  const teacher = await prisma.user.create({
    data: { firstName: "T", lastName: run, role: "TEACHER" },
  });
  const dbCourse = await prisma.course.create({
    data: { slug: `c-${run}`, title: "C", teacherId: teacher.id },
  });
  const dbGroup = await prisma.group.create({
    data: { name: `G-${run}`, courseId: dbCourse.id, scheduleDays: [] },
  });
  const date = new Date("2026-09-16");
  const mk = (groupId: string | null) =>
    prisma.attendanceSession.create({ data: { courseId: dbCourse.id, date, groupId } });
  const codeOf = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return "создано";
    } catch (error) {
      return (error as { code?: string }).code ?? "ошибка";
    }
  };

  check("первое занятие без группы", await codeOf(() => mk(null)), "создано");
  check("дубль без группы отклонён", await codeOf(() => mk(null)), "P2002");
  check("первое занятие группы", await codeOf(() => mk(dbGroup.id)), "создано");
  check("дубль занятия группы отклонён", await codeOf(() => mk(dbGroup.id)), "P2002");
  check(
    "другая дата — не дубль",
    await codeOf(() =>
      prisma.attendanceSession.create({
        data: { courseId: dbCourse.id, date: new Date("2026-09-17"), groupId: null },
      })
    ),
    "создано"
  );

  console.log(failed === 0 ? "\n✅ все проверки пройдены" : `\n❌ провалено: ${failed}`);
  await prismaUnscoped.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Файл — модуль, а не глобальный скрипт: иначе его переменные верхнего уровня
// сталкиваются с такими же из соседнего скрипта проверок.
export {};
