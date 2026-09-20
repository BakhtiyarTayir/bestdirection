/**
 * Разовая выгрузка «кто теперь под каким логином» — владелец раздаёт это
 * людям после шага 1 отказа от почты (PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md,
 * 4.1). Пароли сюда не попадают: в базе лежит только хэш, а не сам пароль.
 *
 * Запуск (из каталога api/):
 *   DATABASE_URL=... npx tsx scripts/export-logins.ts > logins.csv
 *
 * Через prismaUnscoped: деактивированные и мягко удалённые тоже должны
 * попасть в выгрузку — иначе владелец решит, что часть сотрудников осталась
 * без логина вовсе.
 */
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      login: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  console.log(["Логин", "Роль", "Фамилия", "Имя", "Почта", "Статус"].map(csvCell).join(","));
  for (const user of users) {
    const status = user.deletedAt ? "удалён" : user.isActive ? "активен" : "выключен";
    console.log(
      [user.login ?? "(нет)", user.role, user.lastName, user.firstName, user.email ?? "", status]
        .map(csvCell)
        .join(",")
    );
  }

  const withoutLogin = users.filter((user) => !user.login).length;
  if (withoutLogin > 0) {
    console.error(
      `Внимание: ${withoutLogin} пользователей без логина — перезапустите api (UserLoginBackfillService заполняет их при старте) и выгрузите заново.`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
