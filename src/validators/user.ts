import { z } from "zod";
import { Role } from "@/generated/prisma";

const roleEnum = z.nativeEnum(Role);

export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters"),
  firstName: z
    .string()
    .min(1, "First name is required"),
  lastName: z
    .string()
    .min(1, "Last name is required"),
  phone: z
    .string()
    .optional(),
  role: roleEnum,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1, "User ID is required"),
  email: z
    .string()
    .email("Invalid email address")
    .optional(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional(),
  firstName: z
    .string()
    .min(1, "First name is required")
    .optional(),
  lastName: z
    .string()
    .min(1, "Last name is required")
    .optional(),
  phone: z
    .string()
    .optional(),
  role: roleEnum.optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(6, "New password must be at least 6 characters"),
  confirmPassword: z
    .string()
    .min(1, "Password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
