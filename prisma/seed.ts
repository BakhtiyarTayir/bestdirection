import { PrismaClient } from "../api/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  const teacherPassword = await bcrypt.hash("teacher123", 10);
  const studentPassword = await bcrypt.hash("student123", 10);

  // Логины добавлены рядом с почтой (шаг 1 отказа от почты, PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md,
  // 4.1): вход принимает и то, и другое, но локальная разработка и тесты
  // должны сразу показывать логин, а не только почту
  const admin = await prisma.user.upsert({
    where: { email: "admin@lms.com" },
    update: {},
    create: {
      email: "admin@lms.com",
      login: "admin",
      passwordHash: adminPassword,
      firstName: "Админ",
      lastName: "Системный",
      role: "ADMIN",
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@lms.com" },
    update: {},
    create: {
      email: "teacher@lms.com",
      login: "teacher",
      passwordHash: teacherPassword,
      firstName: "Иван",
      lastName: "Преподаватель",
      role: "TEACHER",
    },
  });

  const student = await prisma.user.upsert({
    where: { email: "student@lms.com" },
    update: {},
    create: {
      email: "student@lms.com",
      login: "student",
      passwordHash: studentPassword,
      firstName: "Мария",
      lastName: "Студент",
      role: "STUDENT",
    },
  });

  console.log("Seed completed:", { admin: admin.login, teacher: teacher.login, student: student.login });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
