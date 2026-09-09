"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { createAuditLog } from "@/lib/audit";
import { revalidateLocalized } from "@/lib/revalidate";
import { revalidatePath } from "next/cache";
import { SITE_LOGO_KEY } from "@/lib/site-settings";

/**
 * Пути, по которым лежат загруженные картинки. Внешние адреса не принимаем:
 * логотип на чужом домене однажды пропадёт, а лендинг — лицо центра.
 */
function isAllowedLogoPath(url: string) {
  return /^\/uploads\/[A-Za-z0-9._/-]+\.(png|jpe?g|webp)$/i.test(url);
}

// ---------- getSiteLogo (ADMIN) ----------
export async function getSiteLogo() {
  return withAuth(
    async () => {
      const row = await prisma.siteSetting.findUnique({
        where: { key: SITE_LOGO_KEY },
        select: { value: true },
      });
      return { success: true as const, data: { url: row?.value ?? null } };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- saveSiteLogo (ADMIN) ----------
/** Пустая строка сбрасывает логотип к файлу из public. */
export async function saveSiteLogo(url: string) {
  return withAuth(
    async (session) => {
      const value = typeof url === "string" ? url.trim() : "";

      if (value && !isAllowedLogoPath(value)) {
        return { success: false as const, error: "invalidLogoPath" };
      }

      if (value) {
        await prisma.siteSetting.upsert({
          where: { key: SITE_LOGO_KEY },
          update: { value },
          create: { key: SITE_LOGO_KEY, value },
        });
      } else {
        await prisma.siteSetting.deleteMany({ where: { key: SITE_LOGO_KEY } });
      }

      await createAuditLog({
        userId: session.user.id,
        entityType: "SiteSetting",
        entityId: SITE_LOGO_KEY,
        action: "UPDATE",
        metadata: { value: value || null },
      });

      // Логотип виден и в CRM, и на лендинге — сбрасываем оба кэша.
      revalidateLocalized("/admin/landing");
      revalidatePath("/marketing", "layout");
      return { success: true as const, data: { url: value || null } };
    },
    { roles: ["ADMIN"] }
  );
}
