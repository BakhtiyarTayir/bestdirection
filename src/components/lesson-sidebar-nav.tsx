"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, EyeOff } from "lucide-react";
import { getCourseLessonNav } from "@/lib/api/lessons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface LessonNavItem {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
}

interface LessonNavData {
  courseTitle: string;
  lessons: LessonNavItem[];
  completedIds: string[];
}

// Список уроков не меняется при переходе между уроками курса —
// держим его в памяти, чтобы сайдбар не мигал скелетоном на каждой навигации.
const navCache = new Map<string, LessonNavData>();

interface LessonSidebarNavProps {
  courseSlug: string;
  activeLessonSlug: string;
  collapsed: boolean;
  onNavigate: () => void;
}

export function LessonSidebarNav({
  courseSlug,
  activeLessonSlug,
  collapsed,
  onNavigate,
}: LessonSidebarNavProps) {
  const t = useTranslations("lessons");
  const [state, setState] = useState<{ slug: string; data: LessonNavData | null }>(
    () => ({ slug: courseSlug, data: navCache.get(courseSlug) ?? null })
  );

  // Сменился курс — сбрасываем данные прямо в рендере, без лишнего прохода эффекта
  if (state.slug !== courseSlug) {
    setState({ slug: courseSlug, data: navCache.get(courseSlug) ?? null });
  }

  useEffect(() => {
    if (navCache.has(courseSlug)) return;
    let cancelled = false;
    getCourseLessonNav(courseSlug)
      .then((result) => {
        if (cancelled || !result.success) return;
        navCache.set(courseSlug, result.data);
        setState({ slug: courseSlug, data: result.data });
      })
      .catch(() => {
        /* остаётся скелетон, ссылка на курс всё равно доступна */
      });
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  const data = state.slug === courseSlug ? state.data : null;
  const completed = new Set(data?.completedIds ?? []);

  return (
    <nav
      className={cn(
        "flex-1 min-h-0 overflow-y-auto",
        collapsed ? "p-2" : "p-4"
      )}
    >
      <TooltipProvider delayDuration={0}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/courses/${courseSlug}`}
                onClick={onNavigate}
                className="mb-2 flex items-center justify-center rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              {data?.courseTitle ?? t("title")}
            </TooltipContent>
          </Tooltip>
        ) : (
          <>
            <Link
              href={`/courses/${courseSlug}`}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">{data?.courseTitle ?? t("title")}</span>
            </Link>
            <p className="mb-1 mt-3 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("title")}
            </p>
          </>
        )}

        {!data && (
          <div className="space-y-1" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-8 animate-pulse rounded-lg bg-muted",
                  collapsed ? "mx-auto w-8" : "w-full"
                )}
              />
            ))}
          </div>
        )}

        {data && data.lessons.length === 0 && !collapsed && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {t("noLessons")}
          </p>
        )}

        <div className="space-y-1">
          {data?.lessons.map((lesson, index) => {
            const isActive = lesson.slug === activeLessonSlug;
            const isCompleted = completed.has(lesson.id);

            const link = (
              <Link
                key={lesson.id}
                href={`/courses/${courseSlug}/lessons/${lesson.slug}`}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-lg py-2 text-sm transition-colors",
                  collapsed ? "justify-center px-2" : "px-3",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    isActive ? "text-primary-foreground/70" : "text-muted-foreground/70"
                  )}
                >
                  {index + 1}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{lesson.title}</span>
                    {!lesson.isPublished && (
                      <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    )}
                    {isCompleted && (
                      <CheckCircle2
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isActive ? "text-primary-foreground" : "text-green-600"
                        )}
                      />
                    )}
                  </>
                )}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={lesson.id}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{lesson.title}</TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}
        </div>
      </TooltipProvider>
    </nav>
  );
}
