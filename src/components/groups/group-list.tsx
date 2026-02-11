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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/use-toast";
import { deleteGroup, toggleGroupActive } from "@/actions/group-actions";

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
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const handleDelete = (groupId: string, groupName: string) => {
    if (!confirm(`Удалить группу "${groupName}"? Студенты останутся записаны на курс, но будут без группы.`)) {
      return;
    }

    startTransition(async () => {
      const result = await deleteGroup(groupId);
      if (!result.success) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else {
        toast({ title: "Группа удалена" });
        router.refresh();
      }
    });
  };

  const handleToggleActive = (groupId: string) => {
    startTransition(async () => {
      const result = await toggleGroupActive(groupId);
      if (!result.success) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else {
        router.refresh();
      }
    });
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <UsersRound className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Нет групп</h3>
        <p className="text-muted-foreground mb-4">
          Создайте группы для организации студентов
        </p>
        <Link href={`/courses/${courseId}/groups/new`}>
          <Button>Создать группу</Button>
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
                  <Badge variant="secondary">Неактивна</Badge>
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
                    Редактировать
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/courses/${courseId}/groups/${group.id}/students`}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Студенты
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleActive(group.id)}>
                  <Power className="mr-2 h-4 w-4" />
                  {group.isActive ? "Деактивировать" : "Активировать"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleDelete(group.id, group.name)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {group._count.enrollments} студентов
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
