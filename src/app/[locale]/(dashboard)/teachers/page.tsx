import { requireRole } from "@/lib/auth-guard";
import { getTeachers } from "@/lib/api/users.server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarCheck } from "lucide-react";
import { TeacherList } from "./teacher-list";

export const dynamic = "force-dynamic";

export default async function TeachersPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("teachers");
  const tCommon = await getTranslations("common");

  const result = await getTeachers();
  const teachers = result.success && result.data ? result.data : [];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/attendance/teachers">
          <Button variant="outline">
            <CalendarCheck className="mr-2 h-4 w-4" />
            {t("attendanceReport")}
          </Button>
        </Link>
      </div>

      {teachers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("noTeachers")}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{tCommon("number")}</TableHead>
                <TableHead>{tCommon("firstName")}</TableHead>
                <TableHead>{t("contacts")}</TableHead>
                <TableHead>{t("groups")}</TableHead>
                <TableHead>{t("courses")}</TableHead>
                <TableHead className="text-right">{t("students")}</TableHead>
                <TableHead className="text-right">{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TeacherList teachers={teachers} />
          </Table>
        </div>
      )}
    </div>
  );
}
