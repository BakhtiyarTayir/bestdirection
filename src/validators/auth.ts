import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "emailRequired")
    .email("emailInvalid"),
  password: z
    .string()
    .min(8, "passwordMinLength"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "firstNameRequired"),
    lastName: z.string().min(1, "lastNameRequired"),
    email: z
      .string()
      .min(1, "emailRequired")
      .email("emailInvalid"),
    password: z
      .string()
      .min(8, "passwordMinLength"),
    confirmPassword: z.string().min(1, "confirmPasswordRequired"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// Шаг «остальные поля» при регистрации: email уже подтверждён кодом
export const registerDetailsSchema = z
  .object({
    firstName: z.string().min(1, "firstNameRequired"),
    lastName: z.string().min(1, "lastNameRequired"),
    password: z
      .string()
      .min(8, "passwordMinLength"),
    confirmPassword: z.string().min(1, "confirmPasswordRequired"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type RegisterDetailsInput = z.infer<typeof registerDetailsSchema>;
