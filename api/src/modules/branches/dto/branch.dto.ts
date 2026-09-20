import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Справочник филиалов: адрес и телефон — свободный текст, счёт не идёт на
// десятки записей, поэтому валидация минимальная (образец — group.dto.ts).

const branchFields = {
  address: z.string().trim().max(300, "maxChars300").optional(),
  phone: z.string().trim().max(30).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
};

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, "branchNameRequired").max(100, "maxChars100"),
  ...branchFields,
});

export const updateBranchSchema = z.object({
  name: z.string().trim().min(1, "branchNameRequired").max(100, "maxChars100").optional(),
  ...branchFields,
});

export class CreateBranchDto extends createZodDto(createBranchSchema) {}
export class UpdateBranchDto extends createZodDto(updateBranchSchema) {}
