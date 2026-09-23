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
  const items: { key: keyof ApiAdminDashboardAttention; href: string; branchless: boolean }[] = [
    { key: "pendingRequests", href: "/courses/requests", branchless: true },
    { key: "uncontactedLeads", href: "/admin/leads", branchless: true },
    { key: "studentsWithoutGroup", href: "/students", branchless: true },
    { key: "groupsWithoutRate", href: "/groups", branchless: false },
    { key: "groupsWithIncompleteJournal", href: "/groups", branchless: false },
  ];

  const messageKey: Record<keyof ApiAdminDashboardAttention, string> = {
    pendingRequests: "attentionPendingRequests",
    uncontactedLeads: "attentionUncontactedLeads",
    studentsWithoutGroup: "attentionStudentsWithoutGroup",
    groupsWithoutRate: "attentionGroupsWithoutRate",
    groupsWithIncompleteJournal: "attentionIncompleteJournal",
  };

  const visible = items.filter((item) => attention[item.key] > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{t("attentionTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
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
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
