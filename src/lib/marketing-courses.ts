// Курсы маркетингового лендинга (it-school-official.uz). Статичный список — НЕ зависит
// от курсов платформы: здесь можно анонсировать набор до того, как курс
// заведён в LMS. Заявки (CourseLead) хранят название курса строкой.
export interface MarketingCourse {
  slug: string;
  title: string;
  cover: string;
  summaryRu: string;
  summaryUz: string;
  /** Цена в UZS; null — «по запросу» */
  price: number | null;
  intakeStartDate: Date | null;
  intakeSeats: number | null;
  intakeNoteRu: string | null;
  intakeNoteUz: string | null;
}

export const marketingCourses: MarketingCourse[] = [
  {
    slug: "html-css",
    title: "HTML va CSS",
    cover: "/marketing/courses/html-css.png",
    summaryUz:
      "Noldan zamonaviy saytlar yaratish: HTML5, CSS3, Flexbox va Grid, adaptiv dizayn va birinchi portfolio loyihalaringiz.",
    summaryRu:
      "Создание современных сайтов с нуля: HTML5, CSS3, Flexbox и Grid, адаптивная вёрстка и первые проекты в портфолио.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "robototexnika-python",
    title: "Robototexnika va Python",
    cover: "/marketing/courses/robototexnika-python.png",
    summaryUz:
      "Robotlarni yig'ish va ularni Python tilida dasturlash: mantiq, algoritmlar va qiziqarli amaliy loyihalar.",
    summaryRu:
      "Сборка роботов и программирование их на Python: логика, алгоритмы и увлекательные практические проекты.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "wordpress",
    title: "WordPress",
    cover: "/marketing/courses/wordpress.png",
    summaryUz:
      "WordPress'da tayyor saytlar: mavzular va plaginlar, internet-do'kon, buyurtmachilar bilan ishlash va saytni yuritish.",
    summaryRu:
      "Сайты на WordPress: темы и плагины, интернет-магазин, работа с заказчиками и сопровождение сайта.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "django",
    title: "Django",
    cover: "/marketing/courses/django-framework.png",
    summaryUz:
      "Python va Django'da backend: ma'lumotlar bazalari, API yaratish va to'liq veb-ilovalarni ishga tushirish.",
    summaryRu:
      "Backend на Python и Django: базы данных, создание API и запуск полноценных веб-приложений.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "javascript",
    title: "JavaScript",
    cover: "/marketing/courses/javascript.png",
    summaryUz:
      "Interaktiv saytlar uchun JavaScript: DOM bilan ishlash, so'rovlar, amaliy loyihalar va kuchli portfolio.",
    summaryRu:
      "JavaScript для интерактивных сайтов: работа с DOM, запросы к серверу, практические проекты и сильное портфолио.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
];

export function findMarketingCourse(slug: string): MarketingCourse | undefined {
  return marketingCourses.find((c) => c.slug === slug);
}
