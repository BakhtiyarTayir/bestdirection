// Курсы маркетингового лендинга (best-direction.uz). Статичный список — НЕ зависит
// от курсов платформы: здесь можно анонсировать набор до того, как курс
// заведён в CRM. Заявки (CourseLead) хранят название курса строкой.
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

// Обложек нет: карточка сама рисует градиент с первой буквой названия — это
// честнее пяти одинаковых стоковых картинок. Фото занятий загружаются
// позже через /admin/landing.
export const marketingCourses: MarketingCourse[] = [
  {
    slug: "general-english",
    title: "General English",
    cover: "",
    summaryRu:
      "Базовый курс от A1 до C1: грамматика, лексика, аудирование и говорение. Три занятия в неделю в группах до 10 человек.",
    summaryUz:
      "A1 dan C1 gacha asosiy kurs: grammatika, leksika, tinglash va gapirish. Haftasiga uch marta, 10 kishigacha guruhlarda.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "ielts",
    title: "IELTS Preparation",
    cover: "",
    summaryRu:
      "Подготовка к IELTS Academic и General: все четыре модуля, пробные экзамены и разбор ошибок. Цель — 6.5 и выше.",
    summaryUz:
      "IELTS Academic va General ga tayyorgarlik: to'rtala modul, sinov imtihonlari va xatolar tahlili. Maqsad — 6.5 va undan yuqori.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "english-for-kids",
    title: "English for Kids",
    cover: "",
    summaryRu:
      "Английский для детей 7–12 лет: игры, песни и проекты вместо зубрёжки. Мягкий вход в язык и первые уверенные фразы.",
    summaryUz:
      "7–12 yoshli bolalar uchun ingliz tili: yodlash o'rniga o'yin, qo'shiq va loyihalar. Tilga yumshoq kirish va birinchi ishonchli iboralar.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "speaking-club",
    title: "Speaking Club",
    cover: "",
    summaryRu:
      "Разговорный клуб для уровня B1 и выше: дискуссии, дебаты и тема недели. Один вечер в неделю полностью на английском.",
    summaryUz:
      "B1 va undan yuqori daraja uchun suhbat klubi: munozara, debat va hafta mavzusi. Haftada bir kecha butunlay ingliz tilida.",
    price: null,
    intakeStartDate: null,
    intakeSeats: null,
    intakeNoteRu: null,
    intakeNoteUz: null,
  },
  {
    slug: "business-english",
    title: "Business English",
    cover: "",
    summaryRu:
      "Английский для работы: переписка, переговоры, презентации и собеседования. Практика на реальных рабочих ситуациях.",
    summaryUz:
      "Ish uchun ingliz tili: yozishmalar, muzokaralar, taqdimotlar va suhbatlar. Haqiqiy ish vaziyatlarida amaliyot.",
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
