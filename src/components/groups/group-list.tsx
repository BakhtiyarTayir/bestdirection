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
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/use-toast";
import { deleteGroup, toggleGroupActive } from "@/actions/group-actions";
import { useTranslations } from "next-intl";

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  schedule: string | null;
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
  _count: { enrollments: number };
}

interface GroupListProps {
  groups: GroupData[];
  courseId: string;
}

export function GroupList({ groups, courseId }: GroupListProps) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

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
        <Link href={`/courses/${courseId}/groups/new`}>
          <Button>{t("createGroup")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <Card key={group.id} className={!group.isActive ? "opacity-60" : ""}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                {group.name}
                {!group.isActive && (
                  <Badge variant="secondary">{tCommon("inactive")}</Badge>
                )}
              </CardTitle>
              {group.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {group.description}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/courses/${courseId}/groups/${group.id}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon("edit")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/courses/${courseId}/groups/${group.id}/students`}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {tCommon("details")}
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
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {t("studentsCount", { count: group._count.enrollments })}
              </div>
              {group.schedule && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {group.schedule}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
