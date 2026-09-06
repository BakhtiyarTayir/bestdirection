import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  findLandingPage,
  getLandingCourses,
  getLandingPages,
  getLandingTexts,
  makeLandingText,
} from "@/lib/marketing-content";
import { MarketingHeader, MarketingFooter } from "../marketing-chrome";
import { EditorContentView } from "../editor-content";

interface LandingPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await findLandingPage(slug);
  if (!page) return {};
  const isUz = locale === "uz";
  return {
    title: (isUz ? page.seoTitleUz : page.seoTitleRu) || (isUz ? page.titleUz : page.titleRu),
    description: (isUz ? page.seoDescUz : page.seoDescRu) || undefined,
  };
}

export default async function MarketingContentPage({ params }: LandingPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await findLandingPage(slug);
  if (!page) notFound();

  const isUz = locale === "uz";
  const t = await getTranslations("marketing");
  const [textRows, courses, pages] = await Promise.all([
    getLandingTexts(),
    getLandingCourses(),
    getLandingPages(),
  ]);
  const mt = makeLandingText(textRows, locale, t);

  const anchorBase = isUz ? "/" : "/ru";
  const title = isUz ? page.titleUz : page.titleRu;
  // Если перевод контента ещё не заполнен — показываем другой язык
  const content = (isUz ? page.contentUz : page.contentRu) ?? (isUz ? page.contentRu : page.contentUz);

  return (
    <div className="min-h-screen bg-white text-[#1F3260]">
      <MarketingHeader mt={mt} anchorBase={anchorBase} />
      <main>
        <article className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="mb-8 text-balance text-3xl font-bold leading-tight md:text-4xl">{title}</h1>
          <EditorContentView content={content} />
        </article>
      </main>
      <MarketingFooter mt={mt} courses={courses} pages={pages} isUz={isUz} anchorBase={anchorBase} />
    </div>
  );
}
