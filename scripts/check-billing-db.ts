/**
 * Проверка реестра начислений и Корзины на НАСТОЯЩЕЙ базе:
 *   BILLING_DB_TEST_URL=postgresql://bd:bd@localhost:5439/bd npm run check:billing-db
 *
 * check-billing проверяет чистую арифметику, а эти ошибки живут на стыке с
 * базой, и tsc их не видит: фильтр платности на переходах «бесплатная ↔
 * платная» и расширение мягкого удаления, прячущее строки Корзины.
 *
 * Скрипт создаёт данные и не убирает их — только одноразовая база. Поэтому
 * берётся отдельная переменная, а не DATABASE_URL из .env, и только localhost:
 *   docker run -d --rm --name bd-test -e POSTGRES_USER=bd -e POSTGRES_PASSWORD=bd \
 *     -e POSTGRES_DB=bd -p 5439:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://bd:bd@localhost:5439/bd npx prisma migrate deploy
 *
 * Месяцы считаются от сегодняшней даты, поэтому проверки не устаревают.
 */

const url = process.env.BILLING_DB_TEST_URL;
if (!url || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error(
    "Нужна BILLING_DB_TEST_URL на одноразовую базу на localhost — см. комментарий в начале файла."
  );
  process.exit(1);
}
// До импорта клиента: он читает DATABASE_URL при создании
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
  const { freezeClosedMonths, loadBillableEnrollments, resolveSchedules } = await import(
    "../src/lib/billing-ledger"
  );
  const { hardDeleteCourseRecord, hardDeleteLessonRecord } = await import("../src/lib/trash");
  const { addMonths, monthKey } = await import("../src/lib/billing");

  const current = monthKey(new Date());
  const month = (delta: number) => addMonths(current, delta);
  const firstDay = (delta: number) => new Date(`${month(delta)}-01T12:00:00.000Z`);
  // Уникальный суффикс: повторный запуск на той же базе не упрётся в slug
  const run = Date.now().toString(36);

  const closed = [month(-4), month(-3), month(-2), month(-1)];
  const atPrice = (price: number) => closed.map((m) => [m, price]);

  const scheduleOf = async (enrollmentId: string) =>
    (await resolveSchedules(await loadBillableEnrollments({ enrollmentId }), current)).get(enrollmentId);
  const amounts = async (enrollmentId: string) =>
    ((await scheduleOf(enrollmentId)) ?? []).map((item) => [item.month, item.charge.amount]);

  const teacher = await prisma.user.create({ data: { firstName: "T", lastName: run, role: "TEACHER" } });
  const student = (name: string) =>
    prisma.user.create({ data: { firstName: name, lastName: run, role: "STUDENT" } });
  const course = (name: string, price: number | null) =>
    prisma.course.create({ data: { slug: `${name}-${run}`, title: name, teacherId: teacher.id, price } });
  const group = (name: string, courseId: string, price: number | null) =>
    prisma.group.create({ data: { name: `${name}-${run}`, courseId, price, scheduleDays: [1, 3, 5] } });
  const enroll = async (
    courseId: string,
    extra: { groupId?: string; priceOverride?: number } = {}
  ) => {
    const { id: studentId } = await student(`S-${courseId.slice(-4)}`);
    return prisma.enrollment.create({ data: { studentId, courseId, startsAt: firstDay(-4), ...extra } });
  };

  console.log("── Корзина: окончательное удаление ──");
  const trashedCourse = await course("trashed", 100);
  await prisma.course.update({ where: { id: trashedCourse.id }, data: { deletedAt: new Date() } });
  check("курс из Корзины удаляется", await hardDeleteCourseRecord(trashedCourse.id, teacher.id), { ok: true });
  check("строки курса больше нет", await prismaUnscoped.course.count({ where: { id: trashedCourse.id } }), 0);
  const audit = await prismaUnscoped.auditLog.findFirst({
    where: { entityId: trashedCourse.id, action: "DELETE" },
  });
  check(
    "удаление записано в журнал",
    (audit?.metadata as Record<string, unknown> | null)?.hardDelete,
    true
  );

  const liveCourse = await course("live", 100);
  check(
    "живой курс в обход Корзины не удаляется",
    await hardDeleteCourseRecord(liveCourse.id, teacher.id),
    { ok: false, error: "notInTrash" }
  );
  check("несуществующий курс", await hardDeleteCourseRecord("missing", teacher.id), {
    ok: false,
    error: "courseNotFound",
  });

  const lesson = await prisma.lesson.create({
    data: { slug: `lesson-${run}`, title: "L", courseId: liveCourse.id },
  });
  await prisma.lesson.update({ where: { id: lesson.id }, data: { deletedAt: new Date() } });
  check("урок из Корзины удаляется", await hardDeleteLessonRecord(lesson.id, teacher.id), { ok: true });
  check("строки урока больше нет", await prismaUnscoped.lesson.count({ where: { id: lesson.id } }), 0);

  console.log("\n── какие записи платные ──");
  const priced = await course("priced", 650000);
  const free = await course("free", null);
  const pricedGroup = await group("priced", free.id, 500000);
  const byCourse = await enroll(priced.id);
  const byGroup = await enroll(free.id, { groupId: pricedGroup.id });
  const byStudent = await enroll(free.id, { priceOverride: 400000 });
  const noPrice = await enroll(free.id);
  const billable = new Set((await loadBillableEnrollments({})).map((e) => e.id));
  check("цена у курса — платная", billable.has(byCourse.id), true);
  check("цена у группы — платная", billable.has(byGroup.id), true);
  check("цена у студента на курсе без цены — платная", billable.has(byStudent.id), true);
  check("цены нет нигде — не платная", billable.has(noPrice.id), false);

  console.log("\n── заморозка при просмотре и смена цены ──");
  const g1 = await group("g1", free.id, 500000);
  const e1 = await enroll(free.id, { groupId: g1.id });
  await scheduleOf(e1.id); // просмотр замораживает закрытые месяцы
  check(
    "заморожены только закрытые месяцы, с ценой расчёта",
    (await prisma.monthlyCharge.findMany({ where: { enrollmentId: e1.id }, orderBy: { month: "asc" } })).map(
      (row) => [row.month, row.amount, row.priceUsed]
    ),
    closed.map((m) => [m, 500000, 500000])
  );
  await freezeClosedMonths({ groupId: g1.id }); // как updateGroup перед записью
  await prisma.group.update({ where: { id: g1.id }, data: { price: 800000 } });
  check("новая цена группы — только с текущего месяца", await amounts(e1.id), [
    ...atPrice(500000),
    [current, 800000],
  ]);
  await Promise.all([freezeClosedMonths({ enrollmentId: e1.id }), freezeClosedMonths({ groupId: g1.id })]);
  check("параллельные заморозки не плодят дубли", await prisma.monthlyCharge.count({ where: { enrollmentId: e1.id } }), 4);

  console.log("\n── бесплатная запись становится платной ──");
  const g2 = await group("g2", free.id, null);
  const e2 = await enroll(free.id, { groupId: g2.id });
  await freezeClosedMonths({ groupId: g2.id }); // как updateGroup
  await prisma.group.update({ where: { id: g2.id }, data: { price: 500000 } });
  check("цену поставили группе — прошлое осталось нулевым", await amounts(e2.id), [...atPrice(0), [current, 500000]]);

  const e3 = await enroll(free.id);
  await freezeClosedMonths({ enrollmentId: e3.id }); // как moveStudentToGroup
  await prisma.enrollment.update({ where: { id: e3.id }, data: { groupId: pricedGroup.id } });
  check("перевели в платную группу — прошлое осталось нулевым", await amounts(e3.id), [...atPrice(0), [current, 500000]]);

  const e4 = await enroll(free.id);
  await freezeClosedMonths({ enrollmentId: e4.id }); // как updateEnrollmentBilling
  await prisma.enrollment.update({ where: { id: e4.id }, data: { priceOverride: 300000 } });
  check("поставили цену студенту — прошлое осталось нулевым", await amounts(e4.id), [...atPrice(0), [current, 300000]]);

  const late = await course("late-price", null);
  const e5 = await enroll(late.id);
  await freezeClosedMonths({ courseId: late.id }); // как updateCourse
  await prisma.course.update({ where: { id: late.id }, data: { price: 650000 } });
  check("поставили цену курсу — прошлое осталось нулевым", await amounts(e5.id), [...atPrice(0), [current, 650000]]);

  console.log("\n── платная запись становится бесплатной ──");
  const g3 = await group("g3", free.id, 500000);
  const e6 = await enroll(free.id, { groupId: g3.id });
  await scheduleOf(e6.id);
  await freezeClosedMonths({ groupId: g3.id });
  await prisma.group.update({ where: { id: g3.id }, data: { price: null } });
  check("цену группы убрали — замороженный долг остался в расчёте", await amounts(e6.id), [
    ...atPrice(500000),
    [current, 0],
  ]);

  const g4 = await group("g4", free.id, 500000);
  const e7 = await enroll(free.id, { groupId: g4.id });
  await scheduleOf(e7.id);
  await freezeClosedMonths({ groupId: g4.id }); // как deleteGroup
  await prisma.enrollment.updateMany({ where: { groupId: g4.id }, data: { groupId: null } });
  await prisma.group.delete({ where: { id: g4.id } });
  check("группу удалили — замороженный долг остался в расчёте", await amounts(e7.id), [
    ...atPrice(500000),
    [current, 0],
  ]);

  const zeroOnly = await enroll(free.id);
  await freezeClosedMonths({ enrollmentId: zeroOnly.id });
  check(
    "бесплатная запись с нулями в реестре в расчёт не попадает",
    (await loadBillableEnrollments({ enrollmentId: zeroOnly.id })).length,
    0
  );

  console.log("\n── отчёт на прошлый месяц ──");
  const report = await resolveSchedules(await loadBillableEnrollments({ enrollmentId: e1.id }), month(-3));
  check(
    "отчёт на прошлый месяц не тянет более поздние замороженные",
    report.get(e1.id)?.map((item) => item.month),
    [month(-4), month(-3)]
  );

  console.log(failed === 0 ? "\n✅ все проверки пройдены" : `\n❌ провалено: ${failed}`);
  await prismaUnscoped.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
