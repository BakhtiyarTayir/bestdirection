import { requireRole } from "@/lib/auth-guard";
import { getLeads } from "@/actions/lead-actions";
import { getTranslations } from "next-intl/server";
import { LeadList } from "./lead-list";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("leads");

  const result = await getLeads();
  const leads = result.success && result.data ? result.data : [];

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">{t("title")}</h1>
      <LeadList initialLeads={leads} />
    </div>
  );
}
