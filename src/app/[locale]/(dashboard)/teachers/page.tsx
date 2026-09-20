import { requireRole } from "@/lib/auth-guard";
import { getTeachers } from "@/lib/api/users.server";
import { getTranslations } from "next-intl/server";
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
import { CalendarCheck, Pencil } from "lucide-react";

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
            <TableBody>
              {teachers.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="font-mono text-muted-foreground tabular-nums">
                    {teacher.number}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {teacher.lastName} {teacher.firstName}
                    </div>
                    {!teacher.isActive && (
                      <Badge variant="outline" className="mt-1">
                        {tCommon("inactive")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{teacher.phone ?? t("noPhone")}</div>
                    <div className="text-muted-foreground">
                      {teacher.login ??
                        (teacher.telegramUsername
                          ? `@${teacher.telegramUsername}`
                          : "—")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {teacher.groups.length === 0 ? (
                      <span className="text-muted-foreground">{t("noGroups")}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {teacher.groups.map((group) => (
                          <div key={group.id}>
                            {group.name}
                            <span className="text-muted-foreground">
                              {" · "}
                              {group.courseTitle}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {teacher.courses.length === 0 ? (
                      <span className="text-muted-foreground">{t("noCourses")}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {teacher.courses.map((course) => (
                          <div key={course.id}>
                            <Link
                              href={`/courses/${course.slug}`}
                              className="hover:underline"
                            >
                              {course.title}
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {teacher.studentCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/users/${teacher.id}/edit`}>
                      <Button variant="outline" size="sm">
                        <Pencil className="h-4 w-4" />
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
