import { PrismaClient } from "../api/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  const teacherPassword = await bcrypt.hash("teacher123", 10);
  const studentPassword = await bcrypt.hash("student123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@lms.com" },
    update: {},
    create: {
      email: "admin@lms.com",
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
      passwordHash: studentPassword,
      firstName: "Мария",
      lastName: "Студент",
      role: "STUDENT",
    },
  });

  console.log("Seed completed:", { admin: admin.email, teacher: teacher.email, student: student.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
