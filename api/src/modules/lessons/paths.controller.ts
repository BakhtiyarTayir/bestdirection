import { Controller, Get, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Authenticated, CurrentAbility } from "../../common/auth/decorators";
import type { AppAbility } from "../../common/policies/abilities";
import { PathsService } from "./paths.service";

const slug = z.string().trim().min(1).max(200);

class ResolvePathDto extends createZodDto(
  z.object({
    courseSlug: slug,
    lessonSlug: slug.optional(),
    homeworkSlug: slug.optional(),
  })
) {}

@Controller("paths")
export class PathsController {
  constructor(private readonly paths: PathsService) {}

  /** slug-адрес → идентификаторы. Недоступное отдаёт 404, как несуществующее. */
  @Authenticated()
  @Get("resolve")
  resolve(@Query() query: ResolvePathDto, @CurrentAbility() ability: AppAbility) {
    return this.paths.resolve(query, ability);
  }
}
