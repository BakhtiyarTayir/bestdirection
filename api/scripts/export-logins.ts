/**
 * Разовая выгрузка «кто под каким логином» — на случай, если владельцу снова
 * понадобится раздать список людям (изначально сделано для шага 1 отказа от
 * почты, PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1). Пароли сюда не
 * попадают: в базе лежит только хэш, а не сам пароль.
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
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  console.log(["Логин", "Роль", "Фамилия", "Имя", "Статус"].map(csvCell).join(","));
  for (const user of users) {
    const status = user.deletedAt ? "удалён" : user.isActive ? "активен" : "выключен";
    console.log([user.login, user.role, user.lastName, user.firstName, status].map(csvCell).join(","));
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
