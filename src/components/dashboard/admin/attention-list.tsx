import { getTranslations } from "next-intl/server";
import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { ApiAdminDashboardAttention } from "@/lib/api/dashboard";

interface AttentionListProps {
  attention: ApiAdminDashboardAttention;
  /** Фильтр филиала выбран — показать пометку у пунктов, которые он не сужает */
  branchFiltered: boolean;
}

/** 1.3 плана: список «требует внимания» — нулевые пункты не показываются. */
export async function AttentionList({ attention, branchFiltered }: AttentionListProps) {
  const t = await getTranslations("dashboardAdmin");

  // У заявок на курс, заявок с сайта и учеников без группы нет привязки к
  // филиалу (Enrollment и EnrollmentRequest своего branchId не хранят) —
  // фильтр по филиалу их не сужает, поэтому при выбранном филиале это стоит
  // явно пометить, чтобы число не выглядело ошибкой фильтра
  const items: { key: Exclude<keyof ApiAdminDashboardAttention, "groupsOverPlan" | "attendingWithoutBilling">; href: string; branchless: boolean }[] = [
    { key: "pendingRequests", href: "/courses/requests", branchless: true },
    { key: "uncontactedLeads", href: "/admin/leads", branchless: true },
    { key: "studentsWithoutGroup", href: "/students", branchless: true },
    { key: "groupsWithoutRate", href: "/groups", branchless: false },
    { key: "groupsWithIncompleteJournal", href: "/groups", branchless: false },
  ];

  const messageKey: Record<Exclude<keyof ApiAdminDashboardAttention, "groupsOverPlan" | "attendingWithoutBilling">, string> = {
    pendingRequests: "attentionPendingRequests",
    uncontactedLeads: "attentionUncontactedLeads",
    studentsWithoutGroup: "attentionStudentsWithoutGroup",
    groupsWithoutRate: "attentionGroupsWithoutRate",
    groupsWithIncompleteJournal: "attentionIncompleteJournal",
  };

  const visible = items.filter((item) => attention[item.key] > 0);
  const overPlan = attention.groupsOverPlan;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t("attentionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 && overPlan.length === 0 && attention.attendingWithoutBilling.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("attentionEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex flex-wrap items-center gap-2 text-sm hover:underline">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>{t(messageKey[item.key], { count: attention[item.key] })}</span>
                  {branchFiltered && item.branchless && (
                    <span className="text-xs text-muted-foreground">({t("noBranchFilter")})</span>
                  )}
                </Link>
              </li>
            ))}
            {attention.attendingWithoutBilling.length > 0 && <li>
              <details><summary className="cursor-pointer text-sm">{t("attentionAttendingWithoutBilling", { count: attention.attendingWithoutBilling.length })}</summary>
                <ul className="ml-6 mt-2 space-y-1 text-sm">{attention.attendingWithoutBilling.map((entry) =>
                  <li key={entry.enrollmentId}><Link className="underline" href={`/payments/students/${entry.studentId}`}>{entry.studentName}</Link>
                    {` · ${entry.courseTitle} · ${entry.groupName} · ${t("attentionBillingEndDate")}: ${entry.billingEndsAt.split("-").reverse().join(".")} · ${t("attentionLastAttendance")}: ${entry.lastAttendanceAt.split("-").reverse().join(".")}`}</li>)}</ul>
              </details>
            </li>}
            {/* По строке на группу: лишнее занятие не оплачивается, пока на нём не стоит «Отработка» */}
            {overPlan.map((item) => (
              <li key={item.groupId}>
                <Link
                  href={`/courses/${item.courseSlug}/groups/${item.groupId}/attendance`}
                  className="flex flex-wrap items-center gap-2 text-sm hover:underline"
                >
                  <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    {t("attentionOverPlan", {
                      group: item.groupName,
                      teacher: item.teacherName,
                      marked: item.marked,
                      planned: item.planned,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
