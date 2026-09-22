"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/ui/list-pagination";
import { Pencil } from "lucide-react";
import type { ApiTeacher } from "@/lib/api/users";

const PAGE_SIZE = 20;

export function TeacherList({ teachers }: { teachers: ApiTeacher[] }) {
  const t = useTranslations("teachers");
  const tCommon = useTranslations("common");
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(teachers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageTeachers = teachers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <>
    <tbody>
      {pageTeachers.map((teacher, index) => (
        <tr key={teacher.id} className="border-b transition-colors hover:bg-muted/50">
          <td className="p-2 align-middle font-mono text-muted-foreground tabular-nums">{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
          <td className="p-2 align-middle"><div className="font-medium">{teacher.lastName} {teacher.firstName}</div>{!teacher.isActive && <Badge variant="outline" className="mt-1">{tCommon("inactive")}</Badge>}</td>
          <td className="p-2 align-middle text-sm"><div>{teacher.phone ?? t("noPhone")}</div><div className="text-muted-foreground">{teacher.login ?? (teacher.telegramUsername ? `@${teacher.telegramUsername}` : "—")}</div></td>
          <td className="p-2 align-middle text-sm">{teacher.groups.length === 0 ? <span className="text-muted-foreground">{t("noGroups")}</span> : <div className="space-y-0.5">{teacher.groups.map((group) => <div key={group.id}>{group.name}<span className="text-muted-foreground"> · {group.courseTitle}</span></div>)}</div>}</td>
          <td className="p-2 align-middle text-sm">{teacher.courses.length === 0 ? <span className="text-muted-foreground">{t("noCourses")}</span> : <div className="space-y-0.5">{teacher.courses.map((course) => <div key={course.id}><Link href={`/courses/${course.slug}`} className="hover:underline">{course.title}</Link></div>)}</div>}</td>
          <td className="p-2 align-middle text-right tabular-nums">{teacher.studentCount}</td>
          <td className="p-2 align-middle text-right"><Link href={`/users/${teacher.id}/edit`}><Button variant="outline" size="sm"><Pencil className="h-4 w-4" /></Button></Link></td>
        </tr>
      ))}
    </tbody>
    <tfoot><tr><td colSpan={7}><ListPagination page={currentPage} totalPages={totalPages} onPageChange={setPage} /></td></tr></tfoot>
  </>;
}
