import { z } from "zod";

export const RoleEnum = z.enum(["ADMIN", "TEACHER", "STUDENT"]);
export type Role = z.infer<typeof RoleEnum>;

const roleEnum = RoleEnum;

export const createUserSchema = z.object({
  email: z
    .string()
    .min(1, "emailRequired")
    .email("emailInvalid"),
  password: z
    .string()
    .min(8, "passwordMinLength"),
  firstName: z
    .string()
    .min(1, "firstNameRequired"),
  lastName: z
    .string()
    .min(1, "lastNameRequired"),
  phone: z
    .string()
    .optional(),
  role: roleEnum,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1, "userIdRequired"),
  email: z
    .string()
    .email("emailInvalid")
    .optional(),
  password: z
    .string()
    .min(8, "passwordMinLength")
    .optional(),
  firstName: z
    .string()
    .min(1, "firstNameRequired")
    .optional(),
  lastName: z
    .string()
    .min(1, "lastNameRequired")
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
    .min(1, "currentPasswordRequired"),
  newPassword: z
    .string()
    .min(8, "newPasswordMinLength"),
  confirmPassword: z
    .string()
    .min(1, "confirmPasswordRequired"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "passwordMismatch",
  path: ["confirmPassword"],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
