"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma";

// ---------- getUsers ----------
export async function getUsers() {
  return withAuth(
    async () => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return { success: true, data: users };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- getUserById ----------
export async function getUserById(id: string) {
  return withAuth(async () => {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) return { success: false, error: "User not found" };

    return { success: true, data: user };
  });
}

// ---------- createUser ----------
export async function createUser(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
}) {
  return withAuth(
    async () => {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      });

      if (existingUser) {
        return { success: false, error: "User with this email already exists" };
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: data.role,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      revalidatePath("/dashboard/users");
      return { success: true, data: user };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- updateUser ----------
export async function updateUser(
  id: string,
  data: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: Role;
    isActive?: boolean;
  }
) {
  return withAuth(
    async () => {
      if (data.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: data.email },
        });

        if (existingUser && existingUser.id !== id) {
          return { success: false, error: "Email is already in use" };
        }
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(data.email !== undefined && { email: data.email }),
          ...(data.firstName !== undefined && { firstName: data.firstName }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.role !== undefined && { role: data.role }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      revalidatePath("/dashboard/users");
      revalidatePath(`/dashboard/users/${id}`);
      return { success: true, data: user };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- deleteUser (soft delete) ----------
export async function deleteUser(id: string) {
  return withAuth(
    async (session) => {
      if (session.user.id === id) {
        return { success: false, error: "Cannot deactivate your own account" };
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      revalidatePath("/dashboard/users");
      return { success: true };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- updateProfile ----------
export async function updateProfile(data: {
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  return withAuth(async (session) => {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
      },
    });

    revalidatePath("/dashboard/profile");
    return { success: true, data: user };
  });
}

// ---------- changePassword ----------
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  return withAuth(async (session) => {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) return { success: false, error: "User not found" };

    const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 10);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash },
    });

    return { success: true };
  });
}
