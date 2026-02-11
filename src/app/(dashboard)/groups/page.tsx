import { requireAuth } from "@/lib/auth-guard";
import { getAllGroups } from "@/actions/group-actions";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, UsersRound } from "lucide-react";

export default async function AllGroupsPage() {
  await requireAuth();

  const result = await getAllGroups();
  const groups = result.success ? result.data : [];

  // Group by course
  const courseMap = new Map<string, { title: string; courseId: string; groups: typeof groups }>();
  for (const group of groups) {
    const key = group.course.id;
    if (!courseMap.has(key)) {
      courseMap.set(key, { title: group.course.title, courseId: key, groups: [] });
    }
    courseMap.get(key)!.groups.push(group);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Все группы</h1>

      {courseMap.size === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <UsersRound className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Нет групп</h3>
          <p className="text-muted-foreground">
            Группы создаются внутри курсов
          </p>
        </div>
      ) : (
        Array.from(courseMap.values()).map(({ title, courseId, groups: courseGroups }) => (
          <div key={courseId} className="space-y-4">
            <h2 className="text-lg font-semibold">
              <Link href={`/courses/${courseId}`} className="hover:underline">
                {title}
              </Link>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {courseGroups.map((group) => (
                <Link
                  key={group.id}
                  href={`/courses/${courseId}/groups/${group.id}/students`}
                >
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        {group.name}
                        {!group.isActive && (
                          <Badge variant="secondary">Неактивна</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {group._count.enrollments}
                        </div>
                        {group.schedule && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {group.schedule}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
