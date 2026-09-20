import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const id = z.string().min(1).max(40);
const relation = z.enum(["MOTHER", "FATHER", "GUARDIAN", "OTHER"]);

export const linkParentSchema = z.object({
  parentId: id,
  studentId: id,
  relation: relation.optional(),
  isPrimary: z.boolean().optional(),
});

export const createParentSchema = z.object({
  studentId: id,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(30),
  relation: relation.optional(),
  isPrimary: z.boolean().optional(),
});

export const updateLinkSchema = z.object({
  relation: relation.optional(),
  isPrimary: z.boolean().optional(),
});

export const studentQuerySchema = z.object({ studentId: id });
export const parentQuerySchema = z.object({ parentId: id.optional() });
export const searchQuerySchema = z.object({ query: z.string().max(100) });
export const groupQuerySchema = z.object({ groupId: id });

export class LinkParentDto extends createZodDto(linkParentSchema) {}
export class CreateParentDto extends createZodDto(createParentSchema) {}
export class UpdateLinkDto extends createZodDto(updateLinkSchema) {}
export class StudentQueryDto extends createZodDto(studentQuerySchema) {}
export class ParentQueryDto extends createZodDto(parentQuerySchema) {}
export class SearchQueryDto extends createZodDto(searchQuerySchema) {}
export class GroupQueryDto extends createZodDto(groupQuerySchema) {}
