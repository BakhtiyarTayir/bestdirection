import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { LeadForm } from "./lead-form";
import { Button } from "@/components/ui/button";
import { marketingCourses } from "@/lib/marketing-courses";

interface MarketingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isUz = locale === "uz";
  const t = await getTranslations("marketing");

  // Курсы лендинга — статичный список, независимый от курсов платформы
  const courses = marketingCourses;

  const testimonials = t.raw("testimonials.items") as Array<{
    quote: string;
    author: string;
    role: string;
  }>;

  const dateFormatter = new Intl.DateTimeFormat(isUz ? "uz-UZ" : "ru-RU", {
    day: "numeric",
    month: "long",
  });
  const priceFormatter = new Intl.NumberFormat(isUz ? "uz-UZ" : "ru-RU");

  return (
    <div className="min-h-screen bg-white text-[#191211]">
      {/* Header — акцентный красный (фон логотипа) */}
      <header className="sticky top-0 z-50 bg-[#8C120C] shadow-[0_2px_16px_rgba(25,18,17,0.25)]">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Image src="/marketing/logo-white.png" alt="" width={521} height={522} className="h-11 w-auto" priority />
            <span className="text-lg font-bold text-white">{t("header.brand")}</span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how" className="rounded-sm text-sm font-semibold text-white/85 hover:text-[#F6B93B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {t("header.how")}
            </a>
            <a href="#courses" className="rounded-sm text-sm font-semibold text-white/85 hover:text-[#F6B93B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {t("header.courses")}
            </a>
            <a href="#reviews" className="rounded-sm text-sm font-semibold text-white/85 hover:text-[#F6B93B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {t("header.reviews")}
            </a>
            <a href="#contacts" className="rounded-sm text-sm font-semibold text-white/85 hover:text-[#F6B93B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {t("header.contacts")}
            </a>
          </nav>
          <a
            href="https://course.uportal.uz"
            className="rounded-full bg-[#F6B93B] px-5 py-2.5 text-sm font-bold text-[#191211] shadow-[0_8px_20px_rgba(25,18,17,0.35)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#ffc95c] hover:shadow-[0_12px_26px_rgba(25,18,17,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t("header.cta")}
          </a>
        </div>
      </header>

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
          <div className="absolute inset-0 bg-gradient-to-br from-[#120d0c]/95 via-[#191211]/90 to-[#33201d]/80" />
          <div className="relative mx-auto max-w-2xl px-6">
            <span className="mb-3 inline-block text-xs font-bold uppercase tracking-wider text-[#F6B93B]">
              {t("hero.eyebrow")}
            </span>
            <h1 className="mb-5 text-balance text-4xl font-bold leading-tight md:text-5xl">
              {t("hero.title")} <span className="text-[#F6B93B]">{t("hero.titleAccent")}</span>
            </h1>
            <p className="mb-9 text-lg text-white/75">{t("hero.subtitle")}</p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="#apply"
                className="rounded-full bg-[#8C120C] px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(140,18,12,0.55)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#a81a12] hover:shadow-[0_14px_30px_rgba(140,18,12,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                {t("hero.ctaPrimary")}
              </a>
              <a
                href="#how"
                className="rounded-full border-2 border-white/50 px-7 py-3.5 text-sm font-bold text-white transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:border-[#F6B93B] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                {t("hero.ctaSecondary")}
              </a>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={t("how.eyebrow")} title={t("how.title")} subtitle={t("how.subtitle")} />
            <div className="grid gap-10 md:grid-cols-3">
              <Step number={1} icon="/marketing/icons/step-request.png" title={t("how.step1Title")} text={t("how.step1Text")} />
              <Step number={2} icon="/marketing/icons/step-schedule.png" title={t("how.step2Title")} text={t("how.step2Text")} />
              <Step number={3} icon="/marketing/icons/step-certificate.png" title={t("how.step3Title")} text={t("how.step3Text")} />
            </div>
          </div>
        </section>

        {/* Courses */}
        <section id="courses" className="scroll-mt-24 bg-[#f9f3e8] py-20">
          <div className="mx-auto max-w-6xl px-6">
            <SectionHead eyebrow={t("courses.eyebrow")} title={t("courses.title")} subtitle={t("courses.subtitle")} />

            {courses.length === 0 ? (
              <p className="text-center text-[#6f6660]">{t("courses.empty")}</p>
            ) : (
              <div className="grid gap-7 md:grid-cols-3">
                {courses.map((course) => {
                  const summary = isUz ? course.summaryUz : course.summaryRu;
                  const intakeNote = (isUz ? course.intakeNoteUz : course.intakeNoteRu) || course.intakeNoteRu;

                  return (
                    <div key={course.slug} className="overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_rgba(25,18,17,0.08)]">
                      <div className="relative flex h-[170px] items-center justify-center bg-gradient-to-br from-[#F6B93B] to-[#191211]">
                        {course.cover ? (
                          <Image src={course.cover} alt={course.title} fill className="object-cover" />
                        ) : (
                          <span className="text-4xl font-bold text-white/70">{course.title.charAt(0)}</span>
                        )}
                      </div>
                      <div className="p-6">
                        <h3 className="mb-2 text-lg font-bold">{course.title}</h3>
                        {summary && <p className="mb-3 line-clamp-3 text-sm text-[#6f6660]">{summary}</p>}
                        {course.intakeStartDate && (
                          <p className="mb-1 text-xs font-semibold text-[#8C120C]">
                            {t("courses.intakeStarts", { date: dateFormatter.format(course.intakeStartDate) })}
                          </p>
                        )}
                        {typeof course.intakeSeats === "number" && (
                          <p className="mb-1 text-xs text-[#6f6660]">
                            {t("courses.intakeSeatsLeft", { count: course.intakeSeats })}
                          </p>
                        )}
                        {intakeNote && <p className="mb-3 text-xs text-[#6f6660]">{intakeNote}</p>}
                        <div className="mt-4 flex items-center justify-between">
                          <strong className="text-lg">
                            {course.price ? `${priceFormatter.format(course.price)} UZS` : t("courses.priceOnRequest")}
                          </strong>
                          <Button asChild size="sm" className="bg-[#8C120C] text-white transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#a81a12] hover:shadow-[0_8px_18px_rgba(140,18,12,0.5)]">
                            <a href="#apply">{t("courses.applyButton")}</a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Reviews + Apply */}
        <section id="reviews" className="scroll-mt-24 py-20">
          <div className="mx-auto grid max-w-6xl gap-7 px-6 md:grid-cols-2">
            <div className="rounded-xl bg-gradient-to-br from-[#191211] to-[#120d0c] p-10 text-white">
              <h2 className="mb-4 text-xl font-bold">{t("testimonials.title")}</h2>
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

            <div id="apply" className="scroll-mt-24 rounded-xl bg-white p-10 shadow-[0_10px_30px_rgba(25,18,17,0.08)]">
              <h2 className="mb-1 text-xl font-bold">{t("leadForm.title")}</h2>
              <p className="mb-6 text-sm text-[#6f6660]">{t("leadForm.subtitle")}</p>
              {courses.length > 0 ? (
                <LeadForm courses={courses.map((c) => ({ slug: c.slug, title: c.title }))} />
              ) : (
                <p className="text-sm text-[#6f6660]">{t("courses.empty")}</p>
              )}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#120d0c] via-[#191211] to-[#33201d] py-20 text-center text-white">
          <div className="mx-auto max-w-xl px-6">
            <h2 className="mb-4 text-balance text-3xl font-bold">
              {t("cta.title")} <span className="text-[#F6B93B]">{t("cta.titleAccent")}</span> {t("cta.titleEnd")}
            </h2>
            <p className="mb-8 text-white/70">{t("cta.subtitle")}</p>
            <a
              href="#apply"
              className="rounded-full bg-[#8C120C] px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(140,18,12,0.55)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#a81a12] hover:shadow-[0_14px_30px_rgba(140,18,12,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              {t("cta.button")}
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="contacts" className="scroll-mt-24 bg-[#120d0c] px-6 py-16 text-white/70">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-4">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Image src="/marketing/logo-white.png" alt="" width={521} height={522} className="h-10 w-auto" />
                <span className="font-bold text-white">{t("header.brand")}</span>
              </div>
              <p className="text-sm">{t("footer.about")}</p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{t("footer.coursesTitle")}</h4>
              <ul className="space-y-3 text-sm">
                {courses.map((course) => (
                  <li key={course.slug}>
                    <a href="#courses" className="hover:text-white">{course.title}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{t("footer.pagesTitle")}</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#how" className="hover:text-white">{t("header.how")}</a></li>
                <li><a href="#courses" className="hover:text-white">{t("header.courses")}</a></li>
                <li><a href="#reviews" className="hover:text-white">{t("header.reviews")}</a></li>
                <li><a href="https://course.uportal.uz" className="hover:text-white">{t("footer.loginLink")}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{t("footer.contactsTitle")}</h4>
              <ul className="space-y-3 text-sm">
                <li>{t("footer.address")}</li>
                <li>{t("footer.phone")}</li>
                <li>{t("footer.email")}</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-xs">
            <span>© {new Date().getFullYear()} {t("header.brand")}. {t("footer.rights")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto mb-12 max-w-xl text-center">
      <span className="mb-2 inline-block text-xs font-bold uppercase tracking-wider text-[#8C120C]">{eyebrow}</span>
      <h2 className="mb-3 text-balance text-3xl font-bold">{title}</h2>
      <p className="text-[#6f6660]">{subtitle}</p>
    </div>
  );
}

function Step({ number, icon, title, text }: { number: number; icon: string; title: string; text: string }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#f9f3e8]">
        <span className="absolute -right-1.5 -top-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#F6B93B] text-[13px] font-extrabold text-[#120d0c]">
          {number}
        </span>
        <Image src={icon} alt="" width={296} height={298} className="h-9 w-auto" />
      </div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="mx-auto max-w-[260px] text-sm text-[#6f6660]">{text}</p>
    </div>
  );
}
