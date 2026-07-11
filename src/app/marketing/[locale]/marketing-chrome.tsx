import Image from "next/image";
import type { LandingCourse, LandingPage } from "@/lib/marketing-content";

// Общие шапка и футер лендинга: используются главной страницей и
// произвольными страницами (uportal.uz/<slug>). Серверные компоненты —
// mt передаётся как функция, клиентской границы здесь нет.

type TextFn = (key: string, values?: Record<string, string | number>) => string;

interface ChromeProps {
  mt: TextFn;
  /** "" на главной (чистые #якоря), "/" или "/ru" на подстраницах */
  anchorBase?: string;
}

export function MarketingHeader({ mt, anchorBase = "" }: ChromeProps) {
  const link =
    "rounded-sm text-sm font-semibold text-white/85 hover:text-[#F6B93B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";
  return (
    <header className="sticky top-0 z-50 bg-[#8C120C] shadow-[0_2px_16px_rgba(25,18,17,0.25)]">
      <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between px-6">
        <a href={anchorBase || "/"} className="flex items-center gap-3">
          <Image src="/marketing/logo-white.png" alt="" width={521} height={522} className="h-11 w-auto" priority />
          <span className="text-lg font-bold text-white">{mt("header.brand")}</span>
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
          href="https://course.uportal.uz"
          className="rounded-full bg-[#F6B93B] px-5 py-2.5 text-sm font-bold text-[#191211] shadow-[0_8px_20px_rgba(25,18,17,0.35)] transition-[transform,box-shadow,background-color] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95 hover:bg-[#ffc95c] hover:shadow-[0_12px_26px_rgba(25,18,17,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
    <footer id="contacts" className="scroll-mt-24 bg-[#120d0c] px-6 py-16 text-white/70">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <Image src="/marketing/logo-white.png" alt="" width={521} height={522} className="h-10 w-auto" />
              <span className="font-bold text-white">{mt("header.brand")}</span>
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
              <li><a href="https://course.uportal.uz" className="hover:text-white">{mt("footer.loginLink")}</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wide text-white">{mt("footer.contactsTitle")}</h4>
            <ul className="space-y-3 text-sm">
              <li>{mt("footer.address")}</li>
              <li>{mt("footer.phone")}</li>
              <li>{mt("footer.email")}</li>
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
