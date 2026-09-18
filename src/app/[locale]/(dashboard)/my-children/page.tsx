import { requireRole } from "@/lib/auth-guard";
import { getParentChildren } from "@/lib/api/attendance.server";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone } from "lucide-react";
import type { ParentRelation } from "@/validators/parent";

// Обобщённый тип withAuth не сохраняет форму data, поэтому описываем её явно
interface ChildLink {
  id: string;
  relation: ParentRelation;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    enrollments: {
      course: { id: string; title: string; slug: string };
      group: { id: string; name: string; schedule: string | null } | null;
    }[];
  };
}

export const dynamic = "force-dynamic";

// Кабинет родителя: ученики, привязанные к его аккаунту. Администратору
// сюда не нужно — у него есть карточка ученика со всеми связями.
export default async function MyChildrenPage() {
  await requireRole(["PARENT", "ADMIN"]);

  const t = await getTranslations("parents");
  const result = await getParentChildren();
  const links: ChildLink[] = result.success ? (result.data as ChildLink[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("myChildren")}</h1>
        <p className="mt-1 text-muted-foreground">{t("childrenDescription")}</p>
      </div>

      {links.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("noChildren")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {links.map((link) => (
            <Card key={link.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {link.student.lastName} {link.student.firstName}
                  <Badge variant="secondary">{t(`relation.${link.relation}`)}</Badge>
                </CardTitle>
                {link.student.phone && (
                  <CardDescription className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {link.student.phone}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {link.student.enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noGroup")}</p>
                ) : (
                  <ul className="space-y-3">
                    {link.student.enrollments.map((e) => (
                      <li key={e.course.id} className="border-l-2 border-primary/40 pl-3">
                        <div className="font-medium">{e.course.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {e.group ? (
                            <>
                              {t("groupLabel")}: {e.group.name}
                              {e.group.schedule ? ` · ${e.group.schedule}` : ""}
                            </>
                          ) : (
                            t("noGroup")
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
