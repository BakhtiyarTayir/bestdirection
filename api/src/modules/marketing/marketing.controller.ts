import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CurrentUser, Public } from "../../common/auth/decorators";
import type { SessionUser } from "../../common/auth/session-user";
import { CheckPolicies } from "../../common/policies/check-policies.decorator";
import {
  MarketingCourseDto,
  MarketingGalleryItemDto,
  MarketingPageDto,
  MarketingReelDto,
  MarketingSeedDto,
  MarketingTestimonialDto,
  MarketingTextsDto,
  SiteLogoDto,
} from "./dto/marketing.dto";
import { MarketingService } from "./marketing.service";

/**
 * Лендинг: публичное чтение и правка администратором.
 * Перенесено из src/actions/marketing-content-actions.ts и
 * src/actions/site-settings-actions.ts в web.
 */
@Controller("marketing")
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  // ─── Публичное ──────────────────────────────────────────────────────────

  @Public()
  @Get("landing")
  landing() {
    return this.marketing.landing();
  }

  @Public()
  @Get("pages/:slug")
  page(@Param("slug") slug: string) {
    return this.marketing.page(slug);
  }

  /** Логотип школы: его показывает и лендинг, и шапка кабинета. */
  @Public()
  @Get("logo")
  async logo() {
    return { url: await this.marketing.logo() };
  }

  // ─── Администрирование ──────────────────────────────────────────────────

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("admin")
  adminContent() {
    return this.marketing.adminContent();
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Get("admin/pages/:id")
  pageById(@Param("id") id: string) {
    return this.marketing.pageById(id);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("courses")
  saveCourse(@Body() body: MarketingCourseDto) {
    return this.marketing.saveCourse(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("reels")
  saveReel(@Body() body: MarketingReelDto) {
    return this.marketing.saveReel(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("gallery")
  saveGalleryItem(@Body() body: MarketingGalleryItemDto) {
    return this.marketing.saveGalleryItem(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("testimonials")
  saveTestimonial(@Body() body: MarketingTestimonialDto) {
    return this.marketing.saveTestimonial(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("pages")
  savePage(@Body() body: MarketingPageDto) {
    return this.marketing.savePage(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("texts")
  saveTexts(@Body() body: MarketingTextsDto) {
    return this.marketing.saveTexts(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Put("logo")
  saveLogo(@Body() body: SiteLogoDto, @CurrentUser() actor: SessionUser) {
    return this.marketing.saveLogo(body.url, actor);
  }

  /** Первичное наполнение: значения присылает web, пишет их api. */
  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Post("seed")
  seed(@Body() body: MarketingSeedDto) {
    return this.marketing.seed(body);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Delete("courses/:id")
  removeCourse(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.marketing.remove("course", id, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Delete("reels/:id")
  removeReel(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.marketing.remove("reel", id, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Delete("gallery/:id")
  removeGalleryItem(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.marketing.remove("gallery", id, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Delete("testimonials/:id")
  removeTestimonial(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.marketing.remove("testimonial", id, actor);
  }

  @CheckPolicies((ability) => ability.can("manage", "all"))
  @Delete("pages/:id")
  removePage(@Param("id") id: string, @CurrentUser() actor: SessionUser) {
    return this.marketing.remove("page", id, actor);
  }
}
