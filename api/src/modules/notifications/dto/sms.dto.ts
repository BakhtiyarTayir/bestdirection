import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const id = z.string().min(1).max(40);

export const createTemplateSchema = z.object({
  title: z.string().trim().min(1, "titleRequired").max(120),
  textRu: z.string().trim().min(1).max(1000),
  textUz: z.string().trim().min(1).max(1000),
  submitToEskiz: z.boolean().optional(),
});

export const broadcastSchema = z.object({
  groupId: id,
  templateId: id,
  locale: z.enum(["ru", "uz"]).optional(),
  // Значения переменных шаблона: {student}, {group} и прочие
  values: z.record(z.string().max(200)).optional(),
});

export const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export class CreateTemplateDto extends createZodDto(createTemplateSchema) {}
export class BroadcastDto extends createZodDto(broadcastSchema) {}
export class LogQueryDto extends createZodDto(logQuerySchema) {}
