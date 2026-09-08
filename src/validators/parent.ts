import { z } from "zod";

export const ParentRelationEnum = z.enum([
  "MOTHER",
  "FATHER",
  "GUARDIAN",
  "OTHER",
]);
export type ParentRelation = z.infer<typeof ParentRelationEnum>;

export const linkParentSchema = z.object({
  parentId: z.string().min(1, "parentIdRequired"),
  studentId: z.string().min(1, "studentIdRequired"),
  relation: ParentRelationEnum.default("OTHER"),
  isPrimary: z.boolean().default(false),
});
export type LinkParentInput = z.infer<typeof linkParentSchema>;

export const updateParentLinkSchema = z.object({
  id: z.string().min(1, "linkIdRequired"),
  relation: ParentRelationEnum.optional(),
  isPrimary: z.boolean().optional(),
});
export type UpdateParentLinkInput = z.infer<typeof updateParentLinkSchema>;

// Создание родителя вместе со связью: администратор заводит контакт прямо
// из карточки ученика, не уходя в раздел пользователей.
export const createParentSchema = z.object({
  studentId: z.string().min(1, "studentIdRequired"),
  firstName: z.string().min(1, "firstNameRequired"),
  lastName: z.string().min(1, "lastNameRequired"),
  // Телефон обязателен: родитель заводится ради связи и СМС-рассылок,
  // контакт без номера в них не попадёт.
  phone: z.string().min(1, "phoneRequired"),
  email: z.union([z.string().email("emailInvalid"), z.literal("")]).optional(),
  relation: ParentRelationEnum.default("OTHER"),
  isPrimary: z.boolean().default(false),
});
export type CreateParentInput = z.infer<typeof createParentSchema>;
