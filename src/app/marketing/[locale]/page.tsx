import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { LeadForm } from "./lead-form";
import { InstagramReels } from "./instagram-reels";
import { MarketingHeader, MarketingFooter } from "./marketing-chrome";
import { Button } from "@/components/ui/button";
import { instagramProfileUrl } from "@/lib/marketing-reels";
import {
  getLandingCourses,
  getLandingGallery,
  getLandingPages,
  getLandingReels,
  getLandingTestimonials,
  getLandingTexts,
  makeLandingText,
} from "@/lib/marketing-content";

interface MarketingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isUz = locale === "uz";
  const t = await getTranslations("marketing");

  // Контент лендинга из БД (редактируется в /admin/landing); пустые таблицы
  // отдают статичные значения по умолчанию
  const [courses, galleryRows, reelUrls, dbTestimonials, textRows, pages] = await Promise.all([
    getLandingCourses(),
    getLandingGallery(),
    getLandingReels(),
    getLandingTestimonials(),
    getLandingTexts(),
    getLandingPages(),
  ]);
  const mt = makeLandingText(textRows, locale, t);

  const messageTestimonials = t.raw("testimonials.items") as Array<{
    quote: string;
    author: string;
    role: string;
  }>;
  const testimonials =
    dbTestimonials.length > 0
      ? dbTestimonials.map((item) => ({
          quote: isUz ? item.quoteUz : item.quoteRu,
          author: item.author,
          role: isUz ? item.roleUz : item.roleRu,
        }))
      : messageTestimonials;

  const galleryItems = galleryRows.map((item) => ({
    image: item.image,
    title: isUz ? item.titleUz : item.titleRu,
    text: isUz ? item.textUz : item.textRu,
  }));

  // У курса есть детальная страница, если опубликована страница с тем же slug
  const pageSlugs = new Set(pages.map((p) => p.slug));

  const dateFormatter = new Intl.DateTimeFormat(isUz ? "uz-UZ" : "ru-RU", {
    day: "numeric",
    month: "long",
  });
  const priceFormatter = new Intl.NumberFormat(isUz ? "uz-UZ" : "ru-RU");

  return (
    <div className="min-h-screen bg-white text-[#1F3260]">
      <MarketingHeader mt={mt} />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden py-24 text-center text-white">
          <Image
            src="/marketing/hero-bg.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#152344]/95 via-[#1F3260]/90 to-[#2C5385]/80" />
          <div className="relative mx-auto max-w-2xl px-6">
            <span className="mb-3 inline-block text-xs font-bold uppercase tracking-wider text-[#4FC3F7]">
              {mt("hero.eyebrow")}
            </span>
            <h1 className="mb-5 text-balance text-4xl font-bold leading-tight md:text-5xl">
              {mt("hero.title")} <span className="text-[#4FC3F7]">{mt("hero.titleAccent")}</span>
            </h1>
            <p className="mb-9 text-lg text-white/75">{mt("hero.subtitle")}</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="#apply"
                className="rounded-full bg-[#0F7CAF] px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(18,150,210,0.55)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#1296D2] hover:shadow-[0_14px_30px_rgba(18,150,210,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                {mt("hero.ctaPrimary")}
              </a>
              <a
                href="#how"
                className="rounded-full border-2 border-white/50 px-7 py-3.5 text-sm font-bold text-white transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:border-[#4FC3F7] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                {mt("hero.ctaSecondary")}
              </a>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={mt("how.eyebrow")} title={mt("how.title")} subtitle={mt("how.subtitle")} />
            <div className="grid gap-10 md:grid-cols-3">
              <Step number={1} icon="/marketing/icons/step-request.png" title={mt("how.step1Title")} text={mt("how.step1Text")} />
              <Step number={2} icon="/marketing/icons/step-schedule.png" title={mt("how.step2Title")} text={mt("how.step2Text")} />
              <Step number={3} icon="/marketing/icons/step-certificate.png" title={mt("how.step3Title")} text={mt("how.step3Text")} />
            </div>
          </div>
        </section>

        {/* Courses */}
        <section id="courses" className="scroll-mt-24 bg-[#F8F3E7] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={mt("courses.eyebrow")} title={mt("courses.title")} subtitle={mt("courses.subtitle")} />

            {courses.length === 0 ? (
              <p className="text-center text-[#5A6A85]">{mt("courses.empty")}</p>
            ) : (
              <div className="grid gap-7 md:grid-cols-3">
                {courses.map((course) => {
                  const summary = isUz ? course.summaryUz : course.summaryRu;
                  const intakeNote = (isUz ? course.intakeNoteUz : course.intakeNoteRu) || course.intakeNoteRu;

                  return (
                    <div key={course.slug} className="overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_rgba(21,35,68,0.08)]">
                      <div className="relative flex h-[170px] items-center justify-center bg-gradient-to-br from-[#4FC3F7] to-[#1F3260]">
                        {course.cover ? (
                          <Image src={course.cover} alt={course.title} fill className="object-cover" />
                        ) : (
                          <span className="text-4xl font-bold text-white/70">{course.title.charAt(0)}</span>
                        )}
                      </div>
                      <div className="p-6">
                        <h3 className="mb-2 text-lg font-bold">{course.title}</h3>
                        {summary && <p className="mb-3 line-clamp-3 text-sm text-[#5A6A85]">{summary}</p>}
                        {course.intakeStartDate && (
                          <p className="mb-1 text-xs font-semibold text-[#0F7CAF]">
                            {mt("courses.intakeStarts", { date: dateFormatter.format(course.intakeStartDate) })}
                          </p>
                        )}
                        {typeof course.intakeSeats === "number" && (
                          <p className="mb-1 text-xs text-[#5A6A85]">
                            {mt("courses.intakeSeatsLeft", { count: course.intakeSeats })}
                          </p>
                        )}
                        {intakeNote && <p className="mb-3 text-xs text-[#5A6A85]">{intakeNote}</p>}
                        <div className="mt-4 flex items-center justify-between">
                          <strong className="text-lg">
                            {course.price ? `${priceFormatter.format(course.price)} UZS` : mt("courses.priceOnRequest")}
                          </strong>
                          <div className="flex items-center gap-2">
                            {pageSlugs.has(course.slug) && (
                              <Button asChild size="sm" variant="outline" className="border-[#0F7CAF] text-[#0F7CAF] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#0F7CAF]/5 hover:text-[#0F7CAF]">
                              <a href={`${isUz ? "/" : "/ru/"}${course.slug}`}>{mt("courses.detailsButton")}</a>
                              </Button>
                            )}
                            <Button asChild size="sm" className="bg-[#0F7CAF] text-white transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#1296D2] hover:shadow-[0_8px_18px_rgba(18,150,210,0.5)]">
                              <a href="#apply">{mt("courses.applyButton")}</a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Robotics gallery */}
        <section id="gallery" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={mt("gallery.eyebrow")} title={mt("gallery.title")} subtitle={mt("gallery.subtitle")} />
            <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
              {galleryItems.map((item) => (
                <figure key={item.image} className="overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_rgba(21,35,68,0.08)]">
                  <Image
                    src={item.image}
                    alt={item.title}
                    width={800}
                    height={600}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="p-5">
                    <h3 className="mb-1 text-base font-bold">{item.title}</h3>
                    <p className="text-sm text-[#5A6A85]">{item.text}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Instagram reels — секции нет, пока не добавлены ссылки на посты */}
        {reelUrls.length > 0 && (
        <section id="reels" className="scroll-mt-24 bg-[#F8F3E7] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={mt("instagram.eyebrow")} title={mt("instagram.title")} subtitle={mt("instagram.subtitle")} />
            <InstagramReels urls={reelUrls} prevLabel={mt("instagram.prev")} nextLabel={mt("instagram.next")} />
            <div className="mt-8 text-center">
              <a
                href={instagramProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full bg-[#0F7CAF] px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(18,150,210,0.55)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#1296D2] hover:shadow-[0_14px_30px_rgba(18,150,210,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3260]"
              >
                {mt("instagram.follow")}
              </a>
            </div>
          </div>
        </section>
        )}

        {/* Reviews + Apply */}
        <section id="reviews" className="scroll-mt-24 py-20">
          <div className="mx-auto grid max-w-6xl gap-7 px-6 md:grid-cols-2">
            <div className="rounded-xl bg-gradient-to-br from-[#1F3260] to-[#152344] p-10 text-white">
              <h2 className="mb-4 text-xl font-bold">{mt("testimonials.title")}</h2>
              <div className="space-y-6">
                {testimonials.map((item, i) => (
                  <div key={i}>
                    <p className="mb-2 text-sm text-white/80">&ldquo;{item.quote}&rdquo;</p>
                    <p className="text-sm font-bold">{item.author}</p>
                    <p className="text-xs text-white/60">{item.role}</p>
                  </div>
                ))}
              </div>
            </div>

            <div id="apply" className="scroll-mt-24 rounded-xl bg-white p-10 shadow-[0_10px_30px_rgba(21,35,68,0.08)]">
              <h2 className="mb-1 text-xl font-bold">{mt("leadForm.title")}</h2>
              <p className="mb-6 text-sm text-[#5A6A85]">{mt("leadForm.subtitle")}</p>
              {courses.length > 0 ? (
                <LeadForm courses={courses.map((c) => ({ slug: c.slug, title: c.title }))} />
              ) : (
                <p className="text-sm text-[#5A6A85]">{mt("courses.empty")}</p>
              )}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#152344] via-[#1F3260] to-[#2C5385] py-20 text-center text-white">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="mb-4 text-balance text-3xl font-bold">
              {mt("cta.title")} <span className="text-[#4FC3F7]">{mt("cta.titleAccent")}</span> {mt("cta.titleEnd")}
            </h2>
            <p className="mb-8 text-white/70">{mt("cta.subtitle")}</p>
            <a
              href="#apply"
              className="rounded-full bg-[#0F7CAF] px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(18,150,210,0.55)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#1296D2] hover:shadow-[0_14px_30px_rgba(18,150,210,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {mt("cta.button")}
            </a>
          </div>
        </section>
      </main>

      <MarketingFooter mt={mt} courses={courses} pages={pages} isUz={isUz} />
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto mb-12 max-w-xl text-center">
      <span className="mb-2 inline-block text-xs font-bold uppercase tracking-wider text-[#0F7CAF]">{eyebrow}</span>
      <h2 className="mb-3 text-balance text-3xl font-bold">{title}</h2>
      <p className="text-[#5A6A85]">{subtitle}</p>
    </div>
  );
}

function Step({ number, icon, title, text }: { number: number; icon: string; title: string; text: string }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#F8F3E7]">
        <span className="absolute -right-1.5 -top-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#4FC3F7] text-[13px] font-extrabold text-[#152344]">
          {number}
        </span>
        <Image src={icon} alt="" width={296} height={298} className="h-9 w-auto" />
      </div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="mx-auto max-w-[260px] text-sm text-[#5A6A85]">{text}</p>
    </div>
  );
}
