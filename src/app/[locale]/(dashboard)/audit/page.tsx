import { requireRole } from "@/lib/auth-guard";
import { getAuditLog } from "@/lib/api/users.server";
import { AuditTable } from "./audit-table";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

interface AuditPageProps {
  searchParams: Promise<{
    entityType?: string;
    action?: string;
    page?: string;
  }>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const t = await getTranslations("audit");
  await requireRole(["ADMIN"]);

  const params = await searchParams;
  const entityType = params.entityType || undefined;
  const action = params.action || undefined;
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const result = await getAuditLog({ entityType, action, page });
  const logs = result.success ? result.data.logs : [];
  const totalPages = result.success ? result.data.totalPages : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <AuditTable
        logs={logs}
        currentPage={page}
        totalPages={totalPages}
        entityType={entityType}
        action={action}
      />
    </div>
  );
}
