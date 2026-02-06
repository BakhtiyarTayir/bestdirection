"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma";

// ---------- getUsers ----------
export async function getUsers() {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN") return { success: false, error: "Forbidden" };

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
  } catch (error) {
    console.error("getUsers error:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}

// ---------- getUserById ----------
export async function getUserById(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

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
  } catch (error) {
    console.error("getUserById error:", error);
    return { success: false, error: "Failed to fetch user" };
  }
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
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN") return { success: false, error: "Forbidden" };

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
  } catch (error) {
    console.error("createUser error:", error);
    return { success: false, error: "Failed to create user" };
  }
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
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN") return { success: false, error: "Forbidden" };

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
  } catch (error) {
    console.error("updateUser error:", error);
    return { success: false, error: "Failed to update user" };
  }
}

// ---------- deleteUser (soft delete) ----------
export async function deleteUser(id: string) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };
    if (session.user.role !== "ADMIN") return { success: false, error: "Forbidden" };

    if (session.user.id === id) {
      return { success: false, error: "Cannot deactivate your own account" };
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    revalidatePath("/dashboard/users");
    return { success: true };
  } catch (error) {
    console.error("deleteUser error:", error);
    return { success: false, error: "Failed to delete user" };
  }
}

// ---------- updateProfile ----------
export async function updateProfile(data: {
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

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
  } catch (error) {
    console.error("updateProfile error:", error);
    return { success: false, error: "Failed to update profile" };
  }
}

// ---------- changePassword ----------
export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  try {
    const session = await auth();
    if (!session?.user) return { success: false, error: "Unauthorized" };

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
  } catch (error) {
    console.error("changePassword error:", error);
    return { success: false, error: "Failed to change password" };
  }
}
