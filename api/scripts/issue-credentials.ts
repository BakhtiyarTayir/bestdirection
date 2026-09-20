/**
 * Разовая выдача учётных данных: логин + НОВЫЙ пароль каждому пользователю.
 *
 * Зачем отдельно от export-logins: пароли в базе лежат хэшами, и существующий
 * пароль выгрузить нельзя в принципе. Чтобы получился список, который можно
 * раздать людям на руки, пароли приходится СГЕНЕРИРОВАТЬ ЗАНОВО. Поэтому
 * запуск скрипта — необратимое действие: прежние пароли перестают работать,
 * и все открытые сессии обрываются.
 *
 * Запуск (из каталога api/):
 *   # сначала посмотреть, кого затронет, ничего не меняя:
 *   DATABASE_URL=... npx tsx scripts/issue-credentials.ts
 *   # затем выдать и записать в файл:
 *   DATABASE_URL=... npx tsx scripts/issue-credentials.ts --apply > credentials.csv
 *
 * Файл содержит пароли открытым текстом. Он не должен попасть в git (см.
 * .gitignore) и должен быть удалён сразу после передачи владельцу.
 *
 * Роли выбираются флагами: по умолчанию затрагиваются все активные
 * пользователи. `--role=STUDENT` сужает до одной роли — например, чтобы не
 * сбрасывать пароль самому себе вместе со всеми.
 */
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { PrismaClient, type Role } from "../generated/prisma";

const prisma = new PrismaClient();

// Столько же раундов, сколько в AuthService — иначе выданные пароли
// проверялись бы по другим правилам, чем заданные через интерфейс
const BCRYPT_ROUNDS = 10;

// Без похожих друг на друга символов: пароль диктуют по телефону и переписывают
// с бумаги, а 0/O и 1/l/I в этом месте дают бесконечные «не подходит»
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PASSWORD_LENGTH = 10;

function generatePassword(): string {
  let password = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return password;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const roleArg = process.argv.find((arg) => arg.startsWith("--role="))?.split("=")[1] as Role | undefined;

  // Мягко удалённые и выключенные не получают паролей: раздавать их некому,
  // а лишние строки в списке сбивают с толку
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      ...(roleArg ? { role: roleArg } : {}),
    },
    select: { id: true, login: true, firstName: true, lastName: true, role: true, branch: { select: { name: true } } },
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  const withoutLogin = users.filter((user) => !user.login);
  if (withoutLogin.length > 0) {
    console.error(
      `Остановлено: ${withoutLogin.length} пользователей без логина. Перезапустите api — логины проставляет UserLoginBackfillService при старте — и повторите.`
    );
    process.exit(1);
  }

  if (!apply) {
    console.error(`Пробный прогон: паролей будет выдано ${users.length}. Ничего не изменено.`);
    console.error("Повторите с --apply, чтобы выдать пароли. Прежние пароли перестанут работать.");
    for (const user of users) {
      console.error(`  ${user.login}\t${user.role}\t${user.lastName} ${user.firstName}`);
    }
    return;
  }

  console.log(["Логин", "Пароль", "Роль", "Фамилия", "Имя", "Филиал"].map(csvCell).join(","));

  for (const user of users) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Пароль и обрыв сессий одной транзакцией: если сессии уцелеют, человек
    // с чужого открытого окна продолжит работать под старым доступом
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    console.log(
      [user.login ?? "", password, user.role, user.lastName, user.firstName, user.branch?.name ?? ""]
        .map(csvCell)
        .join(",")
    );
  }

  console.error(`Выдано паролей: ${users.length}. Прежние пароли больше не действуют, все сессии закрыты.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
