import { prisma } from "@/lib/prisma";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { LeadForm } from "./lead-form";
import { Button } from "@/components/ui/button";

interface MarketingPageProps {
  params: Promise<{ locale: string }>;
}

export default async function MarketingPage({ params }: MarketingPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isUz = locale === "uz";
  const t = await getTranslations("marketing");

  const courses = await prisma.course.findMany({
    where: { isPublicListed: true, isPublished: true, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      coverImage: true,
      price: true,
      publicSummaryRu: true,
      publicSummaryUz: true,
      intakeStartDate: true,
      intakeSeats: true,
      intakeNoteRu: true,
      intakeNoteUz: true,
    },
  });

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
    <div className="min-h-screen bg-white text-[#16213e]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#16213e]">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between px-6">
          <Image src="/marketing/logo-mark.png" alt={t("header.brand")} width={486} height={224} className="h-9 w-auto" priority />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#how" className="text-sm font-semibold text-white/85 hover:text-[#2ed47a]">
              {t("header.how")}
            </a>
            <a href="#courses" className="text-sm font-semibold text-white/85 hover:text-[#2ed47a]">
              {t("header.courses")}
            </a>
            <a href="#reviews" className="text-sm font-semibold text-white/85 hover:text-[#2ed47a]">
              {t("header.reviews")}
            </a>
            <a href="#contacts" className="text-sm font-semibold text-white/85 hover:text-[#2ed47a]">
              {t("header.contacts")}
            </a>
          </nav>
          <a
            href="https://course.uportal.uz"
            className="rounded-full bg-[#2ed47a] px-5 py-2.5 text-sm font-bold text-[#0f1830] shadow-[0_8px_20px_rgba(46,212,122,0.35)] hover:bg-[#24b567]"
          >
            {t("header.cta")}
          </a>
        </div>
      </header>

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
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f1830]/95 via-[#16213e]/90 to-[#1e2c52]/80" />
        <div className="relative mx-auto max-w-2xl px-6">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-wider text-[#24b567]">
            {t("hero.eyebrow")}
          </span>
          <h1 className="mb-5 text-4xl font-bold leading-tight md:text-5xl">
            {t("hero.title")} <span className="text-[#2ed47a]">{t("hero.titleAccent")}</span>
          </h1>
          <p className="mb-9 text-lg text-white/75">{t("hero.subtitle")}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="#apply"
              className="rounded-full bg-[#2ed47a] px-7 py-3.5 text-sm font-bold text-[#0f1830] shadow-[0_8px_20px_rgba(46,212,122,0.35)] hover:bg-[#24b567]"
            >
              {t("hero.ctaPrimary")}
            </a>
            <a
              href="#how"
              className="rounded-full border-2 border-white/50 px-7 py-3.5 text-sm font-bold text-white hover:bg-white/10"
            >
              {t("hero.ctaSecondary")}
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead eyebrow={t("how.eyebrow")} title={t("how.title")} subtitle={t("how.subtitle")} />
          <div className="grid gap-10 md:grid-cols-3">
            <Step number={1} title={t("how.step1Title")} text={t("how.step1Text")} />
            <Step number={2} title={t("how.step2Title")} text={t("how.step2Text")} />
            <Step number={3} title={t("how.step3Title")} text={t("how.step3Text")} />
          </div>
        </div>
      </section>

      {/* Courses */}
      <section id="courses" className="bg-[#eef3fb] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHead eyebrow={t("courses.eyebrow")} title={t("courses.title")} subtitle={t("courses.subtitle")} />

          {courses.length === 0 ? (
            <p className="text-center text-[#6b7280]">{t("courses.empty")}</p>
          ) : (
            <div className="grid gap-7 md:grid-cols-3">
              {courses.map((course) => {
                const summary = (isUz ? course.publicSummaryUz : course.publicSummaryRu) || course.publicSummaryRu;
                const intakeNote = (isUz ? course.intakeNoteUz : course.intakeNoteRu) || course.intakeNoteRu;

                return (
                  <div key={course.id} className="overflow-hidden rounded-xl bg-white shadow-[0_10px_30px_rgba(22,33,62,0.08)]">
                    <div className="relative flex h-[170px] items-center justify-center bg-gradient-to-br from-[#2ed47a] to-[#16213e]">
                      {course.coverImage ? (
                        <Image src={course.coverImage} alt={course.title} fill className="object-cover" />
                      ) : (
                        <span className="text-4xl font-bold text-white/70">{course.title.charAt(0)}</span>
                      )}
                    </div>
                    <div className="p-6">
                      <h3 className="mb-2 text-lg font-bold">{course.title}</h3>
                      {summary && <p className="mb-3 text-sm text-[#6b7280]">{summary}</p>}
                      {course.intakeStartDate && (
                        <p className="mb-1 text-xs font-semibold text-[#24b567]">
                          {t("courses.intakeStarts", { date: dateFormatter.format(course.intakeStartDate) })}
                        </p>
                      )}
                      {typeof course.intakeSeats === "number" && (
                        <p className="mb-1 text-xs text-[#6b7280]">
                          {t("courses.intakeSeatsLeft", { count: course.intakeSeats })}
                        </p>
                      )}
                      {intakeNote && <p className="mb-3 text-xs text-[#6b7280]">{intakeNote}</p>}
                      <div className="mt-4 flex items-center justify-between">
                        <strong className="text-lg">
                          {course.price ? `${priceFormatter.format(course.price)} UZS` : t("courses.priceOnRequest")}
                        </strong>
                        <a href="#apply">
                          <Button size="sm" className="bg-[#2ed47a] text-[#0f1830] hover:bg-[#24b567]">
                            {t("courses.applyButton")}
                          </Button>
                        </a>
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
      <section id="reviews" className="py-20">
        <div className="mx-auto grid max-w-6xl gap-7 px-6 md:grid-cols-2">
          <div className="rounded-xl bg-gradient-to-br from-[#16213e] to-[#0f1830] p-10 text-white">
            <h3 className="mb-4 text-xl font-bold">{t("testimonials.title")}</h3>
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

          <div id="apply" className="scroll-mt-24 rounded-xl bg-white p-10 shadow-[0_10px_30px_rgba(22,33,62,0.08)]">
            <h3 className="mb-1 text-xl font-bold">{t("leadForm.title")}</h3>
            <p className="mb-6 text-sm text-[#6b7280]">{t("leadForm.subtitle")}</p>
            {courses.length > 0 ? (
              <LeadForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
            ) : (
              <p className="text-sm text-[#6b7280]">{t("courses.empty")}</p>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0f1830] via-[#16213e] to-[#1e2c52] py-20 text-center text-white">
        <div className="mx-auto max-w-xl px-6">
          <h2 className="mb-4 text-3xl font-bold">
            {t("cta.title")} <span className="text-[#2ed47a]">{t("cta.titleAccent")}</span> {t("cta.titleEnd")}
          </h2>
          <p className="mb-8 text-white/70">{t("cta.subtitle")}</p>
          <a
            href="#apply"
            className="rounded-full bg-[#2ed47a] px-7 py-3.5 text-sm font-bold text-[#0f1830] shadow-[0_8px_20px_rgba(46,212,122,0.35)] hover:bg-[#24b567]"
          >
            {t("cta.button")}
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer id="contacts" className="bg-[#0f1830] px-6 py-16 text-white/70">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-4">
            <div>
              <Image src="/marketing/logo-mark.png" alt={t("header.brand")} width={486} height={224} className="mb-4 h-9 w-auto" />
              <p className="text-sm">{t("footer.about")}</p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{t("footer.coursesTitle")}</h4>
              <ul className="space-y-3 text-sm">
                {courses.map((course) => (
                  <li key={course.id}>
                    <a href="#courses">{course.title}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{t("footer.pagesTitle")}</h4>
              <ul className="space-y-3 text-sm">
                <li><a href="#how">{t("header.how")}</a></li>
                <li><a href="#courses">{t("header.courses")}</a></li>
                <li><a href="#reviews">{t("header.reviews")}</a></li>
                <li><a href="https://course.uportal.uz">{t("footer.loginLink")}</a></li>
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
      <span className="mb-2 inline-block text-xs font-bold uppercase tracking-wider text-[#24b567]">{eyebrow}</span>
      <h2 className="mb-3 text-3xl font-bold">{title}</h2>
      <p className="text-[#6b7280]">{subtitle}</p>
    </div>
  );
}

function Step({ number, title, text }: { number: number; title: string; text: string }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 border-[#eef3fb] text-[#16213e]">
        <span className="absolute -right-1.5 -top-1.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#2ed47a] text-[13px] font-extrabold text-[#0f1830]">
          {number}
        </span>
        <span className="text-2xl font-bold">{number}</span>
      </div>
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <p className="mx-auto max-w-[260px] text-sm text-[#6b7280]">{text}</p>
    </div>
  );
}
