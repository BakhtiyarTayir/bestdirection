"use server";

import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/action-utils";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { leadLimiter, getClientIp, isWithinRateLimit } from "@/lib/rate-limit";
import { submitLeadSchema, type SubmitLeadInput } from "@/validators/lead";
import { findLandingCourse } from "@/lib/marketing-content";

// ---------- submitCourseLead (public, no auth) ----------
export async function submitCourseLead(input: SubmitLeadInput) {
  const parsed = submitLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: "invalidInput" };
  }

  const { courseSlug, fullName, phone, message, website } = parsed.data;
  if (website) {
    // Honeypot tripped — silently pretend success so bots don't learn to skip the field.
    return { success: true as const };
  }

  const headersList = await headers();
  const ip = getClientIp({ headers: headersList });
  const allowed = await isWithinRateLimit(leadLimiter, ip);
  if (!allowed) {
    return { success: false as const, error: "tooManyRequests" };
  }

  // Курсы лендинга (БД, редактируются в /admin/landing) — заявка не
  // привязана к курсам платформы, название курса хранится строкой.
  const course = await findLandingCourse(courseSlug);
  if (!course) {
    return { success: false as const, error: "courseNotFound" };
  }

  await prisma.courseLead.create({
    data: { courseName: course.title, fullName, phone, message },
  });

  return { success: true as const };
}

// ---------- getLeads (ADMIN) ----------
export async function getLeads() {
  return withAuth(
    async () => {
      const leads = await prisma.courseLead.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          phone: true,
          message: true,
          contacted: true,
          createdAt: true,
          courseName: true,
        },
      });

      return { success: true as const, data: leads };
    },
    { roles: ["ADMIN"] }
  );
}

// ---------- markLeadContacted (ADMIN) ----------
export async function markLeadContacted(id: string, contacted: boolean) {
  return withAuth(
    async () => {
      await prisma.courseLead.update({
        where: { id },
        data: { contacted },
      });

      revalidatePath("/admin/leads");
      return { success: true as const };
    },
    { roles: ["ADMIN"] }
  );
}
