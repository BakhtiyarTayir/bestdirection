import "server-only";
import { apiPublicFetch, apiServerFetch } from "./server";

// Контент лендинга из api. Публичные маршруты — без куки, поэтому их можно
// звать и со страниц лендинга, где пользователя нет.

export interface ApiLandingCourse {
  id: string;
  slug: string;
  title: string;
  summaryRu: string | null;
  summaryUz: string | null;
  cover: string | null;
  price: number | null;
  intakeStartDate: string | null;
  intakeSeats: number | null;
  intakeNoteRu: string | null;
  intakeNoteUz: string | null;
  sortOrder: number;
  published: boolean;
}

export interface ApiLandingGalleryItem {
  id: string;
  image: string;
  titleRu: string;
  titleUz: string;
  textRu: string;
  textUz: string;
  sortOrder: number;
  published: boolean;
}

export interface ApiLandingTestimonial {
  id: string;
  quoteRu: string;
  quoteUz: string;
  author: string;
  roleRu: string;
  roleUz: string;
  sortOrder: number;
  published: boolean;
}

export interface ApiLandingPageSummary {
  slug: string;
  titleRu: string;
  titleUz: string;
  showInFooter: boolean;
}

export interface ApiLandingContent {
  courses: ApiLandingCourse[];
  reels: string[];
  gallery: ApiLandingGalleryItem[];
  testimonials: ApiLandingTestimonial[];
  texts: Record<string, { ru: string; uz: string }>;
  pages: ApiLandingPageSummary[];
  logo: string | null;
}

/** Блок Editor.js; data зависит от типа блока. Разметку чистит api. */
export interface EditorBlock {
  id?: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export interface EditorContent {
  time?: number;
  blocks: EditorBlock[];
  version?: string;
}

export interface ApiLandingPage {
  slug: string;
  titleRu: string;
  titleUz: string;
  contentRu: EditorContent | null;
  contentUz: EditorContent | null;
  seoTitleRu: string | null;
  seoTitleUz: string | null;
  seoDescRu: string | null;
  seoDescUz: string | null;
  showInFooter: boolean;
}

export const getLandingContent = () => apiPublicFetch<ApiLandingContent>("/marketing/landing");

export const getLandingPage = (slug: string) =>
  apiPublicFetch<ApiLandingPage>(`/marketing/pages/${encodeURIComponent(slug)}`);

export const getSiteLogo = () => apiPublicFetch<{ url: string | null }>("/marketing/logo");

export const getMarketingAdminContent = () =>
  apiServerFetch<{
    courses: ApiLandingCourse[];
    reels: { id: string; url: string; sortOrder: number; published: boolean }[];
    gallery: ApiLandingGalleryItem[];
    testimonials: ApiLandingTestimonial[];
    texts: { key: string; ru: string; uz: string }[];
    pages: (ApiLandingPage & { id: string; published: boolean; sortOrder: number })[];
  }>("/marketing/admin");

export const getMarketingPageById = (id: string) =>
  apiServerFetch<ApiLandingPage & { id: string; published: boolean; sortOrder: number }>(
    `/marketing/admin/pages/${id}`
  );

export const getLeads = () =>
  apiServerFetch<
    {
      id: string;
      fullName: string;
      phone: string;
      message: string | null;
      contacted: boolean;
      createdAt: string;
      courseName: string;
    }[]
  >("/leads");

/** Бейдж «Заявки» в сайдбаре — заявки без отметки «связались» */
export const getUncontactedLeadsCount = () => apiServerFetch<{ count: number }>("/leads/count");
