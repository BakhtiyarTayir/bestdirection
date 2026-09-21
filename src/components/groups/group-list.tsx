"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  MoreVertical,
  Edit,
  Trash2,
  UserPlus,
  Calendar,
  Power,
  UsersRound,
  BarChart3,
  Banknote,
  GraduationCap,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/use-toast";
import { deleteGroup, toggleGroupActive } from "@/lib/api/groups";
import type { ApiGroupTeacher } from "@/lib/api/groups";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  schedule: string | null;
  isActive: boolean;
  // api отдаёт даты строками ISO
  startDate: Date | string | null;
  endDate: Date | string | null;
  price: number | null;
  _count: { enrollments: number };
  // Показываем всегда: имя группы уникально внутри филиала, а не на весь
  // центр — без бейджа две «Python-1» в разных филиалах не различить
  branch?: { id: string; name: string } | null;
  // Карточка группы (план «Уроки и карточка группы», этап 4): своего
  // преподавателя может не быть — тогда показывается педагог курса с
  // пометкой, что он унаследован; то же для цены
  teacher: ApiGroupTeacher | null;
  courseTeacher?: ApiGroupTeacher;
  coursePrice?: number | null;
}

interface GroupListProps {
  groups: GroupData[];
  courseSlug: string;
}

export function GroupList({ groups, courseSlug }: GroupListProps) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const money = new Intl.NumberFormat(intlLocale(locale));

  const handleDelete = (groupId: string, groupName: string) => {
    if (!confirm(t("deleteGroupConfirm", { name: groupName }))) {
      return;
    }

    startTransition(async () => {
      const result = await deleteGroup(groupId);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
      } else {
        toast({ title: t("groupDeleted") });
        router.refresh();
      }
    });
  };

  const handleToggleActive = (groupId: string) => {
    startTransition(async () => {
      const result = await toggleGroupActive(groupId);
      if (!result.success) {
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
      } else {
        router.refresh();
      }
    });
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <UsersRound className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">{t("noGroups")}</h3>
        <p className="text-muted-foreground mb-4">
          {t("createGroupsMessage")}
        </p>
        <Link href={`/courses/${courseSlug}/groups/new`}>
          <Button>{t("createGroup")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => {
        // Не задан свой — показываем педагога курса с пометкой: именно по
        // этой лестнице (group.teacherId ?? course.teacherId) считаются и
        // отчёты, и зарплата (план, 5.2)
        const teacher = group.teacher ?? group.courseTeacher ?? null;
        const teacherInherited = group.teacher === null && group.courseTeacher !== undefined;
        // Своей цены нет — цена курса, тоже с пометкой: иначе не отличить
        // от «месяц бесплатный»
        const price = group.price ?? group.coursePrice ?? null;
        const priceInherited = group.price === null && group.coursePrice !== undefined;

        return (
          <Card key={group.id} className={!group.isActive ? "opacity-60" : ""}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  {group.name}
                  {!group.isActive && (
                    <Badge variant="secondary">{tCommon("inactive")}</Badge>
                  )}
                </CardTitle>
                {group.branch && (
                  <p className="text-xs text-muted-foreground">
                    {/* С подписью: без неё название филиала читается как часть
                        названия группы — просьба владельца от 2026-09-21 */}
                    {t("branch")}: {group.branch.name}
                  </p>
                )}
                {group.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {group.description}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={isPending}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/courses/${courseSlug}/groups/${group.id}/statistics`}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      {t("statistics")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleToggleActive(group.id)}>
                    <Power className="mr-2 h-4 w-4" />
                    {group.isActive ? t("deactivate") : t("activate")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(group.id, group.name)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 shrink-0" />
                  {t("studentsCount", { count: group._count.enrollments })}
                </div>
                {group.schedule && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 shrink-0" />
                    {group.schedule}
                  </div>
                )}
                {teacher && (
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="h-4 w-4 shrink-0" />
                    <span>
                      {teacher.lastName} {teacher.firstName}
                      {teacherInherited && (
                        <span className="ml-1 text-xs">({t("teacherFromCourseShort")})</span>
                      )}
                    </span>
                  </div>
                )}
                {price !== null && (
                  <div className="flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 shrink-0" />
                    <span>
                      {money.format(price)} UZS
                      {priceInherited && (
                        <span className="ml-1 text-xs">({t("priceFromCourseShort")})</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Наружу — только действия, которыми пользуются постоянно;
                  остальное («Статистика», вкл/выкл, удаление) — под «тремя
                  точками», это редкие и опасные действия (план, 5.3) */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`/courses/${courseSlug}/groups/${group.id}`} className="flex-1 min-w-[130px] sm:flex-none">
                  <Button variant="outline" size="sm" className="w-full">
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon("edit")}
                  </Button>
                </Link>
                <Link
                  href={`/courses/${courseSlug}/groups/${group.id}/students`}
                  className="flex-1 min-w-[130px] sm:flex-none"
                >
                  <Button variant="outline" size="sm" className="w-full">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("addStudents")}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
