"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Code2, FileText, File, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

interface PendingSubmission {
  id: string;
  code: string;
  attemptNumber: number;
  createdAt: string | Date;
  student: { id: string; firstName: string; lastName: string };
  homework: {
    id: string;
    slug: string;
    title: string;
    type: string;
    language: string | null;
    lesson: {
      id: string;
      slug: string;
      title: string;
      course: { id: string; slug: string; title: string };
    };
    _count: { testCases: number };
    [key: string]: unknown;
  };
  testResults: { passed: boolean }[];
  files: { id: string; filename: string; size: number }[];
  [key: string]: unknown;
}

interface HistorySubmission {
  id: string;
  manualStatus: string | null;
  manualScore: number | null;
  reviewedAt: string | Date | null;
  student: { id: string; firstName: string; lastName: string };
  homework: {
    id: string;
    slug: string;
    title: string;
    type: string;
    lesson: {
      slug: string;
      title: string;
      course: { slug: string; title: string };
    };
    [key: string]: unknown;
  };
  reviewedBy: { firstName: string; lastName: string } | null;
  [key: string]: unknown;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  CODE: Code2,
  TEXT: FileText,
  FILE: File,
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  REVISION: RotateCcw,
};

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "text-green-600",
  REJECTED: "text-destructive",
  REVISION: "text-yellow-600",
};

export function TeacherReviewList({
  pending,
  history,
}: {
  pending: PendingSubmission[];
  history: HistorySubmission[];
}) {
  const t = useTranslations("homeworkHub");
  const [tab, setTab] = useState<"pending" | "history">("pending");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "history")}>
      <TabsList>
        <TabsTrigger value="pending" className="gap-1.5">
          {t("review.pending")}
          {pending.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs">
              {pending.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="history">{t("review.history")}</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-4">
        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t("review.noSubmissions")}
          </div>
        ) : (
          <PendingTable submissions={pending} />
        )}
      </TabsContent>

      <TabsContent value="history" className="mt-4">
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t("review.noHistory")}
          </div>
        ) : (
          <HistoryTable submissions={history} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function PendingTable({ submissions }: { submissions: PendingSubmission[] }) {
  const t = useTranslations("homeworkHub");

  // Group by course
  const courseMap = new Map<string, { title: string; items: PendingSubmission[] }>();
  for (const sub of submissions) {
    const key = sub.homework.lesson.course.slug;
    if (!courseMap.has(key)) {
      courseMap.set(key, { title: sub.homework.lesson.course.title, items: [] });
    }
    courseMap.get(key)!.items.push(sub);
  }

  return (
    <div className="space-y-6">
      {Array.from(courseMap.entries()).map(([slug, { title, items }]) => (
        <div key={slug} className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("review.student")}</TableHead>
                  <TableHead>{t("review.homework")}</TableHead>
                  <TableHead>{t("review.type")}</TableHead>
                  <TableHead>{t("review.autoTests")}</TableHead>
                  <TableHead>{t("review.submitted")}</TableHead>
                  <TableHead className="text-right">{t("review.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((sub) => {
                  const TypeIcon = TYPE_ICONS[sub.homework.type] || Code2;
                  const passed = sub.testResults.filter((r) => r.passed).length;
                  const total = sub.homework._count.testCases;
                  const timeAgo = getRelativeTime(sub.createdAt);

                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {sub.student.firstName} {sub.student.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            #{sub.attemptNumber}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {sub.homework.title}
                          <span className="text-xs text-muted-foreground block">
                            {sub.homework.lesson.title}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <TypeIcon className="h-3.5 w-3.5" />
                          <span className="text-xs">{t(`type.${sub.homework.type}`)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {total > 0 ? (
                          <span className={passed === total ? "text-green-600" : "text-yellow-600"}>
                            {passed}/{total}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {timeAgo}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/homework/review/${sub.id}`}>
                          <Button size="sm">{t("review.check")}</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTable({ submissions }: { submissions: HistorySubmission[] }) {
  const t = useTranslations("homeworkHub");

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("review.student")}</TableHead>
            <TableHead>{t("review.homework")}</TableHead>
            <TableHead>{t("review.reviewed")}</TableHead>
            <TableHead>{t("review.reviewedBy")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {submissions.map((sub) => {
            const StatusIcon = STATUS_ICONS[sub.manualStatus || ""] || CheckCircle2;
            const statusColor = STATUS_COLORS[sub.manualStatus || ""] || "";

            return (
              <TableRow key={sub.id}>
                <TableCell>
                  {sub.student.firstName} {sub.student.lastName}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {sub.homework.title}
                    <span className="text-xs text-muted-foreground block">
                      {sub.homework.lesson.course.title} / {sub.homework.lesson.title}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className={`flex items-center gap-1.5 ${statusColor}`}>
                    <StatusIcon className="h-4 w-4" />
                    <span className="text-sm">{t(`status.${sub.manualStatus?.toLowerCase()}`)}</span>
                    {sub.manualScore != null && (
                      <Badge variant="outline" className="ml-1 text-xs">{sub.manualScore}%</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {sub.reviewedBy
                    ? `${sub.reviewedBy.firstName} ${sub.reviewedBy.lastName}`
                    : "—"}
                  {sub.reviewedAt && (
                    <span className="block text-xs">
                      {new Date(sub.reviewedAt).toLocaleDateString()}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function getRelativeTime(dateStr: string | Date): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} д назад`;
}
