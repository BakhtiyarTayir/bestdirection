"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AttendanceGrid } from "@/components/attendance-grid";
import { CreateSessionDialog } from "@/components/create-session-dialog";
import { ArrowRight } from "lucide-react";
import type { ApiAttendanceSession } from "@/lib/api/attendance";
import type { ApiEnrolledStudent } from "@/lib/api/courses";

interface GroupTabData {
  id: string;
  name: string;
  sessions: ApiAttendanceSession[];
  students: ApiEnrolledStudent[];
}

interface CourseAttendanceTabsProps {
  courseId: string;
  courseSlug: string;
  groups: GroupTabData[];
  initialGroupId: string;
}

/**
 * Вкладки по группам курса (план «Журнал посещаемости по группам», п.4):
 * данные всех групп уже загружены сервером — школа маленькая, групп в курсе
 * немного, поэтому переключение вкладок мгновенное и без похода на сервер.
 * Открытая вкладка живёт в URL (?group=), чтобы ссылку можно было переслать —
 * router.replace ничего заново не грузит, только обновляет адрес.
 */
export function CourseAttendanceTabs({ courseId, courseSlug, groups, initialGroupId }: CourseAttendanceTabsProps) {
  const t = useTranslations("attendance");
  const router = useRouter();
  const pathname = usePathname();
  const [activeGroupId, setActiveGroupId] = useState(initialGroupId);

  const setActive = (groupId: string) => {
    setActiveGroupId(groupId);
    const params = new URLSearchParams(window.location.search);
    params.set("group", groupId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={activeGroupId} onValueChange={setActive}>
      <TabsList className="flex-wrap h-auto">
        {groups.map((group) => (
          <TabsTrigger key={group.id} value={group.id}>
            {group.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((group) => (
        <TabsContent key={group.id} value={group.id} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={`/courses/${courseSlug}/groups/${group.id}/attendance`}>
              <Button variant="outline" size="sm">
                {t("openGroupJournal")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <CreateSessionDialog courseId={courseId} courseSlug={courseSlug} defaultGroupId={group.id} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{group.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <AttendanceGrid sessions={group.sessions} students={group.students} courseSlug={courseSlug} />
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
