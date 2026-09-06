import Image from "next/image";
import type { LandingCourse, LandingPage } from "@/lib/marketing-content";
import { LMS_URL } from "@/lib/marketing-domain";
import { CONTACT_PHONE, CONTACT_TELEGRAM_URL } from "@/lib/marketing-contacts";

// Общие шапка и футер лендинга: используются главной страницей и
// произвольными страницами (best-direction.uz/<slug>). Серверные компоненты —
// mt передаётся как функция, клиентской границы здесь нет.

type TextFn = (key: string, values?: Record<string, string | number>) => string;

interface ChromeProps {
  mt: TextFn;
  /** "" на главной (чистые #якоря), "/" или "/ru" на подстраницах */
  anchorBase?: string;
}

export function MarketingHeader({ mt, anchorBase = "" }: ChromeProps) {
  const link =
    "rounded-sm text-sm font-semibold text-[#1F3260] hover:text-[#0F7CAF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7CAF]";
  return (
    <header className="sticky top-0 z-50 border-b border-[#E3E8EF] bg-white shadow-[0_2px_16px_rgba(21,35,68,0.06)]">
      <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between px-6">
        <a href={anchorBase || "/"} className="flex items-center">
          {/* Логотип уже содержит надпись «Best Direction» — дублировать её текстом не нужно */}
          <Image
            src="/marketing/logo.png"
            alt={mt("header.brand")}
            width={877}
            height={490}
            className="h-11 w-auto"
            priority
          />
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          <a href={`${anchorBase}#how`} className={link}>
            {mt("header.how")}
          </a>
          <a href={`${anchorBase}#courses`} className={link}>
            {mt("header.courses")}
          </a>
          <a href={`${anchorBase}#reviews`} className={link}>
            {mt("header.reviews")}
          </a>
          <a href={`${anchorBase}#contacts`} className={link}>
            {mt("header.contacts")}
          </a>
        </nav>
        <a
          href={LMS_URL}
          className="rounded-full bg-[#0F7CAF] px-5 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(18,150,210,0.35)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#1296D2] hover:shadow-[0_12px_26px_rgba(18,150,210,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3260]"
        >
          {mt("header.cta")}
        </a>
      </div>
    </header>
  );
}

interface FooterProps extends ChromeProps {
  courses: LandingCourse[];
  pages: LandingPage[];
  isUz: boolean;
}

export function MarketingFooter({ mt, courses, pages, isUz, anchorBase = "" }: FooterProps) {
  const pageBase = isUz ? "/" : "/ru/";
  return (
    <footer id="contacts" className="scroll-mt-24 bg-[#152344] px-6 py-16 text-white/70">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center">
              <Image src="/marketing/logo-white.png" alt={mt("header.brand")} width={877} height={490} className="h-12 w-auto" />
            </div>
            <p className="text-sm">{mt("footer.about")}</p>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{mt("footer.coursesTitle")}</h4>
            <ul className="space-y-3 text-sm">
              {courses.map((course) => (
                <li key={course.slug}>
                  <a href={`${anchorBase}#courses`} className="hover:text-white">{course.title}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{mt("footer.pagesTitle")}</h4>
            <ul className="space-y-3 text-sm">
              <li><a href={`${anchorBase}#how`} className="hover:text-white">{mt("header.how")}</a></li>
              <li><a href={`${anchorBase}#courses`} className="hover:text-white">{mt("header.courses")}</a></li>
              <li><a href={`${anchorBase}#gallery`} className="hover:text-white">{mt("gallery.eyebrow")}</a></li>
              <li><a href={`${anchorBase}#reviews`} className="hover:text-white">{mt("header.reviews")}</a></li>
              {pages
                .filter((page) => page.showInFooter)
                .map((page) => (
                  <li key={page.slug}>
                    <a href={`${pageBase}${page.slug}`} className="hover:text-white">
                      {isUz ? page.titleUz : page.titleRu}
                    </a>
                  </li>
                ))}
              <li><a href={LMS_URL} className="hover:text-white">{mt("footer.loginLink")}</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{mt("footer.contactsTitle")}</h4>
            <ul className="space-y-3 text-sm">
              <li>
                <a href={`tel:${CONTACT_PHONE.replace(/[^+\d]/g, "")}`} className="font-semibold text-white hover:text-[#4FC3F7]">
                  {CONTACT_PHONE}
                </a>
              </li>
              {/* Адрес пока без ссылки на карту — точка на карте появится вместе с реальным адресом */}
              <li>{mt("footer.address")}</li>
              <li>
                <a href={CONTACT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                  {mt("footer.telegram")}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-xs">
          <span>© {new Date().getFullYear()} {mt("header.brand")}. {mt("footer.rights")}</span>
        </div>
      </div>
    </footer>
  );
}
