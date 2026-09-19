import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../../generated/prisma";
import { AuditService } from "../../common/audit/audit.service";
import type { SessionUser } from "../../common/auth/session-user";
import { sanitizeEditorContent, sanitizePlain } from "../../common/marketing/sanitize";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RevalidateService } from "../../common/revalidate/revalidate.service";
import type {
  MarketingCourseDto,
  MarketingGalleryItemDto,
  MarketingPageDto,
  MarketingReelDto,
  MarketingSeedDto,
  MarketingTestimonialDto,
  MarketingTextsDto,
} from "./dto/marketing.dto";

/**
 * Контент лендинга. Перенесено из src/actions/marketing-content-actions.ts и
 * src/lib/marketing-content.ts в web.
 *
 * Статичные значения по умолчанию остались в web: это тексты сайта и переводы,
 * им место рядом с версткой. Сюда они приходят только при первичном наполнении.
 */

// Адреса, которые занимает само приложение
const RESERVED_PAGE_SLUGS = new Set(["ru", "uz", "api", "marketing", "login", "register"]);

const BY_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/** Ключ настройки тот же, что и прежде: иначе прод потерял бы свой логотип. */
const SITE_LOGO_KEY = "siteLogoUrl";

// Только наши загруженные картинки
const ALLOWED_LOGO_PATH = /^\/uploads\/[A-Za-z0-9._/-]+\.(png|jpe?g|webp)$/i;

const ENTITY_TYPES = {
  course: "MarketingCourse",
  reel: "MarketingReel",
  gallery: "MarketingGalleryItem",
  testimonial: "MarketingTestimonial",
  page: "MarketingPage",
} as const;

@Injectable()
export class MarketingService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService
  ) {}

  private get prisma() {
    return this.prismaService.prisma;
  }

  // ─── Публичное чтение ──────────────────────────────────────────────────

  /** Всё, что нужно лендингу, одним запросом. */
  async landing() {
    const [courses, reels, gallery, testimonials, texts, pages, logo] = await Promise.all([
      this.prisma.marketingCourse.findMany({ where: { published: true }, orderBy: BY_ORDER }),
      this.prisma.marketingReel.findMany({ where: { published: true }, orderBy: BY_ORDER }),
      this.prisma.marketingGalleryItem.findMany({ where: { published: true }, orderBy: BY_ORDER }),
      this.prisma.marketingTestimonial.findMany({ where: { published: true }, orderBy: BY_ORDER }),
      this.prisma.marketingText.findMany(),
      this.prisma.marketingPage.findMany({
        where: { published: true },
        orderBy: BY_ORDER,
        select: { slug: true, titleRu: true, titleUz: true, showInFooter: true },
      }),
      this.logo(),
    ]);

    return {
      courses,
      reels: reels.map((reel) => reel.url),
      gallery,
      testimonials,
      texts: Object.fromEntries(texts.map((text) => [text.key, { ru: text.ru, uz: text.uz }])),
      pages,
      logo,
    };
  }

  /**
   * Страница лендинга по адресу. Разметка чистится и на выдаче: строки,
   * записанные до появления очистки, тоже не должны попасть на сайт как есть
   * (аудит 2.11).
   */
  async page(slug: string) {
    const page = await this.prisma.marketingPage.findFirst({
      where: { slug, published: true },
    });
    if (!page) throw new NotFoundException("pageNotFound");

    return {
      slug: page.slug,
      titleRu: page.titleRu,
      titleUz: page.titleUz,
      contentRu: sanitizeEditorContent(page.contentRu),
      contentUz: sanitizeEditorContent(page.contentUz),
      seoTitleRu: page.seoTitleRu,
      seoTitleUz: page.seoTitleUz,
      seoDescRu: page.seoDescRu,
      seoDescUz: page.seoDescUz,
      showInFooter: page.showInFooter,
    };
  }

  async logo() {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: SITE_LOGO_KEY } });
    return row?.value?.trim() || null;
  }

  // ─── Администрирование ─────────────────────────────────────────────────

  /** Весь контент, включая скрытый: для страницы управления лендингом. */
  async adminContent() {
    const [courses, reels, gallery, testimonials, texts, pages] = await Promise.all([
      this.prisma.marketingCourse.findMany({ orderBy: BY_ORDER }),
      this.prisma.marketingReel.findMany({ orderBy: BY_ORDER }),
      this.prisma.marketingGalleryItem.findMany({ orderBy: BY_ORDER }),
      this.prisma.marketingTestimonial.findMany({ orderBy: BY_ORDER }),
      this.prisma.marketingText.findMany({ orderBy: { key: "asc" } }),
      this.prisma.marketingPage.findMany({ orderBy: BY_ORDER }),
    ]);
    return { courses, reels, gallery, testimonials, texts, pages };
  }

  async pageById(id: string) {
    const page = await this.prisma.marketingPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException("pageNotFound");
    return page;
  }

  async saveCourse(data: MarketingCourseDto) {
    const { id, ...fields } = data;
    await this.ensureSlugFree("marketingCourse", fields.slug, id);

    const row = id
      ? await this.prisma.marketingCourse.update({ where: { id }, data: fields })
      : await this.prisma.marketingCourse.create({ data: fields });

    await this.published();
    return { id: row.id };
  }

  async saveReel(data: MarketingReelDto) {
    const { id, ...fields } = data;
    const row = id
      ? await this.prisma.marketingReel.update({ where: { id }, data: fields })
      : await this.prisma.marketingReel.create({ data: fields });

    await this.published();
    return { id: row.id };
  }

  async saveGalleryItem(data: MarketingGalleryItemDto) {
    const { id, ...fields } = data;
    const row = id
      ? await this.prisma.marketingGalleryItem.update({ where: { id }, data: fields })
      : await this.prisma.marketingGalleryItem.create({ data: fields });

    await this.published();
    return { id: row.id };
  }

  async saveTestimonial(data: MarketingTestimonialDto) {
    const { id, ...fields } = data;
    const row = id
      ? await this.prisma.marketingTestimonial.update({ where: { id }, data: fields })
      : await this.prisma.marketingTestimonial.create({ data: fields });

    await this.published();
    return { id: row.id };
  }

  /** Страница лендинга. Разметка чистится перед записью (аудит 2.11). */
  async savePage(data: MarketingPageDto) {
    const { id, contentRu, contentUz, ...fields } = data;

    if (RESERVED_PAGE_SLUGS.has(fields.slug)) throw new BadRequestException("slugTaken");
    await this.ensureSlugFree("marketingPage", fields.slug, id);

    const payload = {
      ...fields,
      seoTitleRu: fields.seoTitleRu ? sanitizePlain(fields.seoTitleRu) : fields.seoTitleRu,
      seoTitleUz: fields.seoTitleUz ? sanitizePlain(fields.seoTitleUz) : fields.seoTitleUz,
      seoDescRu: fields.seoDescRu ? sanitizePlain(fields.seoDescRu) : fields.seoDescRu,
      seoDescUz: fields.seoDescUz ? sanitizePlain(fields.seoDescUz) : fields.seoDescUz,
      contentRu: this.editorJson(contentRu),
      contentUz: this.editorJson(contentUz),
    };

    const row = id
      ? await this.prisma.marketingPage.update({ where: { id }, data: payload })
      : await this.prisma.marketingPage.create({ data: payload });

    await this.published();
    return { id: row.id };
  }

  async saveTexts(data: MarketingTextsDto) {
    await this.prisma.$transaction(
      data.texts.map(({ key, ru, uz }) =>
        this.prisma.marketingText.upsert({
          where: { key },
          create: { key, ru, uz },
          update: { ru, uz },
        })
      )
    );
    await this.published();
    return { saved: data.texts.length };
  }

  /**
   * Логотип. Принимаем только загруженные к нам картинки: логотип на чужом
   * домене однажды пропадёт, а лендинг — лицо центра. Пустая строка сбрасывает
   * его к файлу из комплекта.
   */
  async saveLogo(url: string, actor: SessionUser) {
    const value = url.trim();
    if (value && !ALLOWED_LOGO_PATH.test(value)) throw new BadRequestException("invalidLogoPath");

    await this.prisma.siteSetting.upsert({
      where: { key: SITE_LOGO_KEY },
      create: { key: SITE_LOGO_KEY, value },
      update: { value },
    });

    await this.audit.record({
      userId: actor.id,
      entityType: "SiteSetting",
      entityId: "siteLogo",
      action: "UPDATE",
      metadata: { value },
    });
    await this.published();
    return { url: value };
  }

  /**
   * Удаление окончательное, поэтому снимок строки уходит в журнал: иначе
   * восстановить контент будет неоткуда.
   */
  async remove(
    kind: "course" | "reel" | "gallery" | "testimonial" | "page",
    id: string,
    actor: SessionUser
  ) {
    const existing = await this.findForRemoval(kind, id);
    if (!existing) throw new NotFoundException("notFound");

    switch (kind) {
      case "course":
        await this.prisma.marketingCourse.delete({ where: { id } });
        break;
      case "reel":
        await this.prisma.marketingReel.delete({ where: { id } });
        break;
      case "gallery":
        await this.prisma.marketingGalleryItem.delete({ where: { id } });
        break;
      case "testimonial":
        await this.prisma.marketingTestimonial.delete({ where: { id } });
        break;
      case "page":
        await this.prisma.marketingPage.delete({ where: { id } });
        break;
    }

    await this.audit.record({
      userId: actor.id,
      entityType: ENTITY_TYPES[kind],
      entityId: id,
      action: "DELETE",
      // Даты в снимке станут строками — JSON другого не умеет
      metadata: { deleted: JSON.parse(JSON.stringify(existing)) as Prisma.JsonObject },
    });

    await this.published();
    return { ok: true as const };
  }

  private findForRemoval(kind: "course" | "reel" | "gallery" | "testimonial" | "page", id: string) {
    switch (kind) {
      case "course":
        return this.prisma.marketingCourse.findUnique({ where: { id } });
      case "reel":
        return this.prisma.marketingReel.findUnique({ where: { id } });
      case "gallery":
        return this.prisma.marketingGalleryItem.findUnique({ where: { id } });
      case "testimonial":
        return this.prisma.marketingTestimonial.findUnique({ where: { id } });
      case "page":
        return this.prisma.marketingPage.findUnique({ where: { id } });
    }
  }

  /**
   * Первичное наполнение: заполняет ПУСТЫЕ таблицы присланными значениями.
   * Непустые не трогает — вызвать повторно безопасно.
   */
  async seed(data: MarketingSeedDto) {
    const seeded: string[] = [];

    if (data.courses?.length && (await this.prisma.marketingCourse.count()) === 0) {
      await this.prisma.marketingCourse.createMany({
        data: data.courses.map((course, index) => ({ ...course, sortOrder: index })),
      });
      seeded.push("courses");
    }

    if (data.reels?.length && (await this.prisma.marketingReel.count()) === 0) {
      await this.prisma.marketingReel.createMany({
        data: data.reels.map((url, index) => ({ url, sortOrder: index })),
      });
      seeded.push("reels");
    }

    if (data.gallery?.length && (await this.prisma.marketingGalleryItem.count()) === 0) {
      await this.prisma.marketingGalleryItem.createMany({
        data: data.gallery.map((item, index) => ({ ...item, sortOrder: index })),
      });
      seeded.push("gallery");
    }

    if (data.testimonials?.length && (await this.prisma.marketingTestimonial.count()) === 0) {
      await this.prisma.marketingTestimonial.createMany({
        data: data.testimonials.map((item, index) => ({ ...item, sortOrder: index })),
      });
      seeded.push("testimonials");
    }

    if (data.texts?.length && (await this.prisma.marketingText.count()) === 0) {
      await this.prisma.marketingText.createMany({ data: data.texts });
      seeded.push("texts");
    }

    if (seeded.length > 0) await this.published();
    return { seeded };
  }

  private editorJson(content: unknown) {
    const clean = sanitizeEditorContent(content);
    return clean ? (clean as unknown as Prisma.InputJsonValue) : Prisma.JsonNull;
  }

  private async ensureSlugFree(
    model: "marketingCourse" | "marketingPage",
    slug: string,
    id?: string
  ) {
    const existing =
      model === "marketingCourse"
        ? await this.prisma.marketingCourse.findUnique({ where: { slug }, select: { id: true } })
        : await this.prisma.marketingPage.findUnique({ where: { slug }, select: { id: true } });

    if (existing && existing.id !== id) throw new BadRequestException("slugTaken");
  }

  /** Лендинг в web кэшируется по тегу — после правки просим его обновиться. */
  private async published() {
    await this.revalidate.marketing();
  }
}
