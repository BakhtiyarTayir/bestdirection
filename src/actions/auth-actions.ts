"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerUserSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export async function registerUser(data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}) {
  const parsed = registerUserSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "invalidData" };
  }

  const normalizedData = {
    ...parsed.data,
    email: parsed.data.email.toLowerCase(),
  };

  const existing = await prisma.user.findUnique({
    where: { email: normalizedData.email },
  });

  if (existing) {
    return { success: false, error: "emailAlreadyExists" };
  }

  const passwordHash = await bcrypt.hash(normalizedData.password, 10);

  try {
    await prisma.user.create({
      data: {
        email: normalizedData.email,
        passwordHash,
        firstName: normalizedData.firstName,
        lastName: normalizedData.lastName,
        role: "STUDENT",
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { success: false, error: "emailAlreadyExists" };
    }
    throw error;
  }

  return { success: true };
}
