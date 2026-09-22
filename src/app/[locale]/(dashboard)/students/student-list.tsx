"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/components/ui/list-pagination";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Wallet } from "lucide-react";

const PAGE_SIZE = 20;

export interface StudentListRow {
  id: string; firstName: string; lastName: string; phone: string | null; login: string | null; isActive: boolean;
  courses: { enrollmentId: string; title: string; groupName: string | null }[]; balance: number;
  branch: { id: string; name: string } | null;
}

export function StudentList({ students }: { students: StudentListRow[] }) {
  const t = useTranslations("students");
  const tCommon = useTranslations("common");
  const tDebtors = useTranslations("debtors");
  const tBilling = useTranslations("studentBilling");
  const locale = useLocale();
  const money = new Intl.NumberFormat(intlLocale(locale));
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStudents = students.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const balanceText = (value: number) => value === 0 ? tBilling("settled") : value > 0 ? tBilling("advance", { amount: money.format(value) }) : tBilling("debt", { amount: money.format(-value) });
  const balanceClass = (value: number) => value === 0 ? "text-muted-foreground" : value > 0 ? "text-emerald-600" : "text-destructive";
  return <>
    <TableBody>{pageStudents.map((student, index) => <TableRow key={student.id}>
      <TableCell className="font-mono text-muted-foreground tabular-nums">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
      <TableCell><Link href={`/payments/students/${student.id}`} className="font-medium hover:underline">{student.lastName} {student.firstName}</Link>{!student.isActive && <Badge variant="outline" className="ml-2">{tCommon("inactive")}</Badge>}</TableCell>
      <TableCell className="text-sm"><div>{student.phone ?? tDebtors("noPhone")}</div><div className="text-muted-foreground">{student.login ?? "—"}</div></TableCell>
      <TableCell className="text-sm text-muted-foreground">{student.branch?.name ?? "—"}</TableCell>
      <TableCell className="text-sm">{student.courses.length === 0 ? <span className="text-muted-foreground">{t("noCourses")}</span> : <div className="space-y-0.5">{student.courses.map((course) => <div key={course.enrollmentId}>{course.title}<span className="text-muted-foreground"> · {course.groupName ?? tDebtors("noGroup")}</span></div>)}</div>}</TableCell>
      <TableCell className={`whitespace-nowrap text-right font-medium ${balanceClass(student.balance)}`}>{balanceText(student.balance)}</TableCell>
      <TableCell className="text-right"><Link href={`/payments/students/${student.id}`}><Button variant="outline" size="sm"><Wallet className="mr-2 h-4 w-4" />{t("openCard")}</Button></Link></TableCell>
    </TableRow>)}</TableBody>
    <tfoot><tr><td colSpan={7}><ListPagination page={currentPage} totalPages={totalPages} onPageChange={setPage} /></td></tr></tfoot>
  </>;
}
