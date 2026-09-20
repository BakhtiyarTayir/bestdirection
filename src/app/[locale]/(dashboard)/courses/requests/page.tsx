import { requireRole } from "@/lib/auth-guard";
import { getEnrollmentRequests } from "@/lib/api/courses.server";
import { getTranslations } from "next-intl/server";
import { RequestsList } from "./requests-list";

export const dynamic = "force-dynamic";

export default async function EnrollmentRequestsPage() {
  await requireRole(["ADMIN", "TEACHER"]);
  const t = await getTranslations("enrollmentRequests");

  const result = await getEnrollmentRequests();
  const requests = result.success && result.data ? result.data : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <RequestsList
        requests={requests.map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          course: { title: r.course.title, price: r.course.price },
          student: {
            firstName: r.student.firstName,
            lastName: r.student.lastName,
            login: r.student.login,
            phone: r.student.phone,
            telegramUsername: r.student.telegramUsername,
          },
        }))}
      />
    </div>
  );
}
