import { z } from "zod";

export const profileSchema = z.object({
  firstName: z.string().min(1, "firstNameRequired"),
  lastName: z.string().min(1, "lastNameRequired"),
  phone: z.string().optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

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
