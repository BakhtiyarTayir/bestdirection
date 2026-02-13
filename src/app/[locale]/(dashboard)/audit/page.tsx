import { requireRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
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

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const t = await getTranslations("audit");
  await requireRole(["ADMIN"]);

  const params = await searchParams;
  const entityType = params.entityType || undefined;
  const action = params.action || undefined;
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
