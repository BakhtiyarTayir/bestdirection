import { requireRole } from "@/lib/auth-guard";
import { getUserById } from "@/lib/api/users.server";
import { getBranches } from "@/lib/api/branches.server";
import { getStudentBilling } from "@/lib/api/billing.server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EditUserForm } from "./edit-user-form";
import { ParentsPanel } from "@/components/parents-panel";
import { StudentAccessCard } from "@/components/student-access-card";
import { TelegramInviteDialog } from "@/components/telegram-invite-dialog";
import { TelegramWriteButton } from "@/components/telegram-write-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface EditUserPageProps {
  params: Promise<{ userId: string }>;
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  await requireRole(["ADMIN"]);

  const { userId } = await params;
  const result = await getUserById(userId);

  if (!result.success || !result.data) {
    notFound();
  }

  const user = result.data;

  const branchesResult = await getBranches();
  const branches = (branchesResult.success && branchesResult.data ? branchesResult.data : []).filter(
    (branch) => branch.isActive || branch.id === user.branchId
  );

  return <EditUserPageContent user={user} branches={branches} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function EditUserPageContent({ user, branches }: { user: any; branches: { id: string; name: string }[] }) {
  const t = await getTranslations("users");

  // Курс/группа/цена уже полностью показаны на карточке биллинга — здесь
  // достаточно короткой сводки со ссылкой (ловушка 4.7.5 плана: дублировать
  // условия обучения в двух формах — верный способ развести две правды)
  const billing = user.role === "STUDENT" ? await getStudentBilling(user.id) : null;
  const enrollments = billing?.success && billing.data ? billing.data.courses : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{t("editUser")}</h1>
        <div className="flex items-center gap-2">
          <TelegramWriteButton username={user.telegramUsername} />
          {(user.role === "STUDENT" || user.role === "PARENT") && (
            <TelegramInviteDialog userId={user.id} hasTelegram={user.hasTelegram} phone={user.phone} />
          )}
        </div>
      </div>
      <EditUserForm user={user} branches={branches} />
      {/* Логин и пароль ученика видит только администратор (страница под requireRole ADMIN) */}
      {user.role === "STUDENT" && <StudentAccessCard userId={user.id} login={user.login} />}
      {user.role === "STUDENT" && enrollments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("enrollmentTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {enrollments.map((enrollment: (typeof enrollments)[number]) => (
              <div key={enrollment.enrollmentId} className="flex items-center justify-between text-sm">
                <span>
                  {enrollment.course.title}
                  {enrollment.group ? ` — ${enrollment.group.name}` : ` (${t("enrollmentNoGroup")})`}
                  {" · "}
                  {enrollment.monthlyPrice.toLocaleString("ru-RU")}
                </span>
                <Link
                  href={`/payments/students/${user.id}`}
                  className="text-primary hover:underline"
                >
                  {t("openBilling")}
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Родители — только у учеников: у остальных ролей связь не имеет смысла */}
      {user.role === "STUDENT" && <ParentsPanel studentId={user.id} />}
    </div>
  );
}
