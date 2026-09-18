import { requireRole } from "@/lib/auth-guard";
import { getTranslations, getLocale } from "next-intl/server";
import { intlLocale } from "@/i18n/config";
import { getStudentsOverview } from "@/lib/api/billing.server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

interface StudentRow {
  id: string;
  number: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  courses: { enrollmentId: string; title: string; groupName: string | null }[];
  balance: number;
}

export default async function StudentsPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("students");
  const tCommon = await getTranslations("common");
  const tDebtors = await getTranslations("debtors");
  const tBilling = await getTranslations("studentBilling");
  const locale = await getLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));

  const result = await getStudentsOverview();
  const students = (result.success && result.data ? result.data : []) as StudentRow[];

  const balanceText = (value: number) =>
    value === 0
      ? tBilling("settled")
      : value > 0
        ? tBilling("advance", { amount: money.format(value) })
        : tBilling("debt", { amount: money.format(-value) });

  const balanceClass = (value: number) =>
    value === 0
      ? "text-muted-foreground"
      : value > 0
        ? "text-emerald-600"
        : "text-destructive";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t("noStudents")}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{tCommon("number")}</TableHead>
                <TableHead>{tCommon("firstName")}</TableHead>
                <TableHead>{t("contacts")}</TableHead>
                <TableHead>{t("courses")}</TableHead>
                <TableHead className="text-right">{tBilling("balance")}</TableHead>
                <TableHead className="text-right">{tCommon("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {student.number}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/payments/students/${student.id}`}
                      className="font-medium hover:underline"
                    >
                      {student.lastName} {student.firstName}
                    </Link>
                    {!student.isActive && (
                      <Badge variant="outline" className="ml-2">
                        {tCommon("inactive")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{student.phone ?? tDebtors("noPhone")}</div>
                    <div className="text-muted-foreground">{student.email ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {student.courses.length === 0 ? (
                      <span className="text-muted-foreground">{t("noCourses")}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {student.courses.map((course) => (
                          <div key={course.enrollmentId}>
                            {course.title}
                            <span className="text-muted-foreground">
                              {" · "}
                              {course.groupName ?? tDebtors("noGroup")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell
                    className={`whitespace-nowrap text-right font-medium ${balanceClass(student.balance)}`}
                  >
                    {balanceText(student.balance)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/payments/students/${student.id}`}>
                      <Button variant="outline" size="sm">
                        <Wallet className="mr-2 h-4 w-4" />
                        {t("openCard")}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
