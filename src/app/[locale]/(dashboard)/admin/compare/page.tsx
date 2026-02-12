"use client";

import { useState, useEffect } from "react";
import {
  compareCourses,
  getCoursesForComparison,
} from "@/actions/course-compare-actions";
import type { CourseDiff } from "@/actions/course-compare-actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, GitCompare, Plus, Minus, RefreshCw, Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface CourseOption {
  id: string;
  title: string;
  teacher: { firstName: string; lastName: string };
  _count: { lessons: number };
}

export default function CompareCoursesPage() {
  const t = useTranslations("compare");
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseAId, setCourseAId] = useState("");
  const [courseBId, setCourseBId] = useState("");
  const [diff, setDiff] = useState<CourseDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);

  useEffect(() => {
    async function load() {
      const result = await getCoursesForComparison();
      if (result.success) {
        setCourses(result.data);
      }
      setIsLoadingCourses(false);
    }
    load();
  }, []);

  const handleCompare = async () => {
    if (!courseAId || !courseBId) return;

    setIsLoading(true);
    setDiff(null);

    try {
      const result = await compareCourses(courseAId, courseBId);
      if (result.success) {
        setDiff(result.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitCompare className="h-6 w-6" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-[1fr,auto,1fr]">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("courseA")}</label>
              <Select
                value={courseAId}
                onValueChange={setCourseAId}
                disabled={isLoadingCourses}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectCourse")} />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title} ({course.teacher.firstName} {course.teacher.lastName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end justify-center pb-2">
              <span className="text-muted-foreground text-2xl">&#8596;</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("courseB")}</label>
              <Select
                value={courseBId}
                onValueChange={setCourseBId}
                disabled={isLoadingCourses}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectCourse")} />
                </SelectTrigger>
                <SelectContent>
                  {courses
                    .filter((c) => c.id !== courseAId)
                    .map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.title} ({course.teacher.firstName} {course.teacher.lastName})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <Button
              onClick={handleCompare}
              disabled={!courseAId || !courseBId || isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("comparing")}
                </>
              ) : (
                <>
                  <GitCompare className="mr-2 h-4 w-4" />
                  {t("compare")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {diff && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <SummaryCard
              title={t("lessons")}
              added={diff.summary.lessonsAdded}
              removed={diff.summary.lessonsRemoved}
              modified={diff.summary.lessonsModified}
              unchanged={diff.summary.lessonsUnchanged}
            />
            <SummaryCard
              title={t("exams")}
              added={diff.summary.examsAdded}
              removed={diff.summary.examsRemoved}
              modified={diff.summary.examsModified}
              unchanged={diff.summary.examsUnchanged}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("lessons")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {diff.lessons.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {t("noLessonsToCompare")}
                </p>
              ) : (
                diff.lessons.map((lessonDiff, index) => (
                  <DiffRow
                    key={index}
                    status={lessonDiff.status}
                    titleA={lessonDiff.lessonA?.title}
                    titleB={lessonDiff.lessonB?.title}
                    changes={lessonDiff.changes}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("exams")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {diff.exams.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {t("noExamsToCompare")}
                </p>
              ) : (
                diff.exams.map((examDiff, index) => (
                  <DiffRow
                    key={index}
                    status={examDiff.status}
                    titleA={examDiff.assessmentA?.title}
                    titleB={examDiff.assessmentB?.title}
                    changes={examDiff.changes}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  added,
  removed,
  modified,
  unchanged,
}: {
  title: string;
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
}) {
  const t = useTranslations("compare");
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600">+{added}</div>
            <div className="text-xs text-muted-foreground">{t("added")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">-{removed}</div>
            <div className="text-xs text-muted-foreground">{t("removed")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">~{modified}</div>
            <div className="text-xs text-muted-foreground">{t("modified")}</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-400">{unchanged}</div>
            <div className="text-xs text-muted-foreground">{t("unchanged")}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DiffRow({
  status,
  titleA,
  titleB,
  changes,
}: {
  status: "added" | "removed" | "modified" | "unchanged";
  titleA?: string | null;
  titleB?: string | null;
  changes: { field: string; valueA: string; valueB: string }[];
}) {
  const t = useTranslations("compare");
  const config = {
    added: {
      bg: "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
      icon: <Plus className="h-4 w-4 text-green-600" />,
      badge: <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{t("addedStatus")}</Badge>,
    },
    removed: {
      bg: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
      icon: <Minus className="h-4 w-4 text-red-600" />,
      badge: <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">{t("removedStatus")}</Badge>,
    },
    modified: {
      bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800",
      icon: <RefreshCw className="h-4 w-4 text-yellow-600" />,
      badge: <Badge variant="outline" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{t("modifiedStatus")}</Badge>,
    },
    unchanged: {
      bg: "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700",
      icon: <Check className="h-4 w-4 text-gray-400" />,
      badge: <Badge variant="outline" className="text-gray-500">{t("unchangedStatus")}</Badge>,
    },
  };

  const { bg, icon, badge } = config[status];
  const title = titleA || titleB;

  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{title}</span>
        </div>
        {badge}
      </div>

      {changes.length > 0 && (
        <div className="mt-2 pl-6 text-sm space-y-1">
          {changes.map((change, i) => (
            <div key={i} className="text-muted-foreground">
              <span className="font-mono text-xs">{change.field}:</span>{" "}
              <span className="text-red-600 line-through">
                {change.valueA || "—"}
              </span>
              {" → "}
              <span className="text-green-600">
                {change.valueB || "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
