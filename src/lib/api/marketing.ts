import { apiFetch } from "./client";

// Правка лендинга из браузера: страница управления и форма заявки.

export const saveMarketingCourse = (body: Record<string, unknown>) =>
  apiFetch<{ id: string }>("/marketing/courses", { method: "POST", body });

export const saveMarketingReel = (body: Record<string, unknown>) =>
  apiFetch<{ id: string }>("/marketing/reels", { method: "POST", body });

export const saveMarketingGalleryItem = (body: Record<string, unknown>) =>
  apiFetch<{ id: string }>("/marketing/gallery", { method: "POST", body });

export const saveMarketingTestimonial = (body: Record<string, unknown>) =>
  apiFetch<{ id: string }>("/marketing/testimonials", { method: "POST", body });

export const saveMarketingPage = (body: Record<string, unknown>) =>
  apiFetch<{ id: string }>("/marketing/pages", { method: "POST", body });

export const saveMarketingTexts = (texts: { key: string; ru: string; uz: string }[]) =>
  apiFetch<{ saved: number }>("/marketing/texts", { method: "POST", body: { texts } });

export const saveSiteLogo = (url: string) =>
  apiFetch<{ url: string }>("/marketing/logo", { method: "PUT", body: { url } });

export const seedMarketingContent = (body: Record<string, unknown>) =>
  apiFetch<{ seeded: string[] }>("/marketing/seed", { method: "POST", body });

type MarketingKind = "courses" | "reels" | "gallery" | "testimonials" | "pages";

export const deleteMarketingItem = (kind: MarketingKind, id: string) =>
  apiFetch<{ ok: true }>(`/marketing/${kind}/${id}`, { method: "DELETE" });

/** Заявка с публичной формы: маршрут открыт, но поток ограничен. */
export const submitCourseLead = (body: {
  courseSlug: string;
  fullName: string;
  phone: string;
  message?: string;
  website?: string;
}) => apiFetch<{ ok: true }>("/leads", { method: "POST", body });

export const markLeadContacted = (id: string, contacted: boolean) =>
  apiFetch<{ id: string; contacted: boolean }>(`/leads/${id}`, {
    method: "PATCH",
    body: { contacted },
  });
