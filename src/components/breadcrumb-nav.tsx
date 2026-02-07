"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Главная",
  courses: "Курсы",
  lessons: "Уроки",
  edit: "Редактирование",
  test: "Тест",
  attempts: "Результаты",
  attendance: "Посещаемость",
  exams: "Экзамены",
  students: "Студенты",
  users: "Пользователи",
  new: "Создание",
  profile: "Профиль",
  "my-results": "Мои результаты",
};

function isDynamicSegment(segment: string): boolean {
  // CUID v1/v2 pattern or generic long ID
  return segment.length >= 20 && /^[a-z0-9]/i.test(segment);
}

export function BreadcrumbNav() {
  const pathname = usePathname();

  // Don't show on dashboard root
  if (pathname === "/dashboard" || pathname === "/") {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);

  // Build breadcrumb items
  const items: { label: string; href: string }[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const href = "/" + segments.slice(0, i + 1).join("/");

    if (isDynamicSegment(segment)) {
      // Skip dynamic segments — the link goes to them but label comes from next segment or "..."
      const nextSegment = segments[i + 1];
      if (nextSegment && SEGMENT_LABELS[nextSegment]) {
        // Will be handled by the next iteration
        continue;
      }
      items.push({ label: "...", href });
    } else {
      const label = SEGMENT_LABELS[segment] ?? segment;
      items.push({ label, href });
    }
  }

  if (items.length <= 1) {
    return null;
  }

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <span key={item.href} className="inline-flex items-center gap-1.5 sm:gap-2.5">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
