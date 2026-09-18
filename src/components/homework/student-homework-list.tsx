"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format-date";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code2, FileText, File, Clock, AlertCircle, CheckCircle2, RotateCcw, MessageSquare } from "lucide-react";
import { LANGUAGE_LABELS } from "@/lib/code-runner/config";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface HomeworkSubmission {
  id: string;
  status: string;
  manualStatus: string | null;
  percentage: number;
  attemptNumber: number;
  teacherComment: string | null;
  createdAt: string | Date;
}

type HomeworkItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: string;
  language: string | null;
  requiresManualReview: boolean;
  dueDate: string | Date | null;
  passingScore: number;
  lesson: {
    id: string;
    slug: string;
    title: string;
    course: {
      id: string;
      slug: string;
      title: string;
    };
  };
  submissions: HomeworkSubmission[];
  _count?: { testCases: number };
}

type Tab = "todo" | "revision" | "pending" | "completed" | "overdue";

function categorize(hw: HomeworkItem): Tab {
  const sub = hw.submissions[0];
  const now = new Date();
  const isOverdue = hw.dueDate && new Date(hw.dueDate) < now;

  if (sub?.manualStatus === "REVISION") return "revision";
  if (sub?.manualStatus === "PENDING") return "pending";
  if (sub?.manualStatus === "APPROVED") return "completed";
  if (sub?.status === "PASSED" && !hw.requiresManualReview) return "completed";

  if (isOverdue && !sub) return "overdue";
  if (isOverdue && sub?.status !== "PASSED") return "overdue";

  return "todo";
}

function getDueUrgency(dueDate: string | Date | null): "urgent" | "soon" | null {
  if (!dueDate) return null;
  const diff = new Date(dueDate).getTime() - Date.now();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return "urgent";
  if (days < 1) return "urgent";
  if (days < 3) return "soon";
  return null;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  CODE: Code2,
  TEXT: FileText,
  FILE: File,
};

export function StudentHomeworkList({ homeworks }: { homeworks: HomeworkItem[] }) {
  const t = useTranslations("homeworkHub");
  const [tab, setTab] = useState<Tab>("todo");

  const grouped: Record<Tab, HomeworkItem[]> = {
    todo: [],
    revision: [],
    pending: [],
    completed: [],
    overdue: [],
  };

  for (const hw of homeworks) {
    grouped[categorize(hw)].push(hw);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "todo", label: t("tabs.todo") },
    { key: "revision", label: t("tabs.revision") },
    { key: "pending", label: t("tabs.pending") },
    { key: "completed", label: t("tabs.completed") },
    { key: "overdue", label: t("tabs.overdue") },
  ];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
            {t.label}
            {grouped[t.key].length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 text-xs">
                {grouped[t.key].length}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tabItem) => (
        <TabsContent key={tabItem.key} value={tabItem.key} className="mt-4">
          {grouped[tabItem.key].length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              {t("noHomeworks")}
            </div>
          ) : (
            <HomeworkCardList homeworks={grouped[tabItem.key]} tab={tabItem.key} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function HomeworkCardList({ homeworks, tab }: { homeworks: HomeworkItem[]; tab: Tab }) {
  // Group by course
  const courseMap = new Map<string, { title: string; slug: string; items: HomeworkItem[] }>();
  for (const hw of homeworks) {
    const key = hw.lesson.course.id;
    if (!courseMap.has(key)) {
      courseMap.set(key, { title: hw.lesson.course.title, slug: hw.lesson.course.slug, items: [] });
    }
    courseMap.get(key)!.items.push(hw);
  }

  return (
    <div className="space-y-6">
      {Array.from(courseMap.values()).map((course) => (
        <div key={course.slug} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{course.title}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {course.items.map((hw) => (
              <HomeworkCard key={hw.id} hw={hw} tab={tab} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HomeworkCard({ hw, tab }: { hw: HomeworkItem; tab: Tab }) {
  const t = useTranslations("homeworkHub");
  const sub = hw.submissions[0];
  const TypeIcon = TYPE_ICONS[hw.type] || Code2;
  const urgency = getDueUrgency(hw.dueDate);
  const href = `/courses/${hw.lesson.course.slug}/lessons/${hw.lesson.slug}/homework/${hw.slug}`;

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TypeIcon className="h-4 w-4 shrink-0" />
            {hw.title}
          </CardTitle>
          {hw.language && (
            <Badge variant="outline" className="text-xs shrink-0">
              {LANGUAGE_LABELS[hw.language] || hw.language}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-1">
          {t("card.lesson")}: {hw.lesson.title}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {hw.dueDate && (
            <span className={`flex items-center gap-1 ${urgency === "urgent" ? "text-destructive font-medium" : urgency === "soon" ? "text-yellow-600 font-medium" : ""}`}>
              <Clock className="h-3 w-3" />
              {urgency === "urgent" && <AlertCircle className="h-3 w-3" />}
              {formatDate(hw.dueDate)}
            </span>
          )}
          {sub && (
            <span className="flex items-center gap-1">
              {t("card.attempt")} #{sub.attemptNumber}
            </span>
          )}
          {sub?.status === "PASSED" && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              {t("card.passed")}
            </span>
          )}
        </div>

        {tab === "revision" && sub?.teacherComment && (
          <div className="flex items-start gap-2 rounded-md bg-muted p-2 text-sm">
            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">{t("card.teacherComment")}:</p>
              <MarkdownRenderer content={sub.teacherComment} className="line-clamp-4 text-sm" />
            </div>
          </div>
        )}

        {tab === "pending" && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "3s" }} />
            {t("status.pending")}
          </div>
        )}

        {(tab === "todo" || tab === "revision") && (
          <Link href={href}>
            <Button size="sm" className="w-full mt-1">
              {sub ? t("card.continue") : t("card.start")}
            </Button>
          </Link>
        )}

        {tab === "completed" && (
          <Link href={href}>
            <Button size="sm" variant="outline" className="w-full mt-1">
              {t("card.passed")}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
