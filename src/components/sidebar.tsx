"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  LayoutDashboard,
  BookOpen,
  Users,
  FileText,
  User,
  LogOut,
  Menu,
  X,
  Trash2,
  ScrollText,
  Copy,
  GitCompare,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  UsersRound,
  ClipboardList,
  BarChart3,
  CalendarCheck,
  Inbox,
  Megaphone,
  Wallet,
  TriangleAlert,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { LanguageSwitcher } from "./language-switcher";
import { LessonSidebarNav } from "./lesson-sidebar-nav";

/** На странице урока сайдбар показывает уроки курса вместо общего меню. */
function matchLessonRoute(pathname: string): { courseSlug: string; lessonSlug: string } | null {
  const match = pathname.match(/^\/courses\/([^/]+)\/lessons\/([^/]+)/);
  if (!match) return null;
  const [, courseSlug, lessonSlug] = match;
  if (lessonSlug === "new") return null;
  return { courseSlug, lessonSlug };
}

interface SidebarProps {
  role: string;
  userName: string;
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  roles: string[];
  badge?: "homework" | "enrollmentRequests" | "debtors";
  /** Подсвечивать только на самом href: иначе родитель горит на вложенном пути */
  exact?: boolean;
  /** Подпункты: родитель становится раскрывающимся разделом */
  children?: { href: string; labelKey: string }[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/courses", labelKey: "courses", icon: BookOpen, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/users", labelKey: "users", icon: Users, roles: ["ADMIN", "TEACHER"] },
  { href: "/statistics", labelKey: "homeworkStats", icon: BarChart3, roles: ["ADMIN", "TEACHER"] },
  { href: "/groups", labelKey: "groups", icon: UsersRound, roles: ["ADMIN", "TEACHER"] },
  { href: "/courses/catalog", labelKey: "catalog", icon: Copy, roles: ["ADMIN", "TEACHER"] },
  { href: "/courses/browse", labelKey: "browseCatalog", icon: BookOpen, roles: ["STUDENT"] },
  { href: "/courses/requests", labelKey: "enrollmentRequests", icon: Inbox, roles: ["ADMIN", "TEACHER"], badge: "enrollmentRequests" },
  { href: "/payments", labelKey: "payments", icon: Wallet, roles: ["ADMIN"], exact: true },
  { href: "/payments/debtors", labelKey: "debtors", icon: TriangleAlert, roles: ["ADMIN"], badge: "debtors" },
  { href: "/admin/compare", labelKey: "compare", icon: GitCompare, roles: ["ADMIN"] },
  { href: "/admin/leads", labelKey: "leads", icon: Inbox, roles: ["ADMIN"] },
  { href: "/admin/sms", labelKey: "sms", icon: MessageSquare, roles: ["ADMIN"] },
  {
    href: "/admin/landing",
    labelKey: "site",
    icon: Megaphone,
    roles: ["ADMIN"],
    children: [
      { href: "/admin/landing", labelKey: "siteLanding" },
      { href: "/admin/landing/pages", labelKey: "sitePages" },
    ],
  },
  { href: "/trash", labelKey: "trash", icon: Trash2, roles: ["ADMIN"] },
  { href: "/audit", labelKey: "audit", icon: ScrollText, roles: ["ADMIN"] },
  { href: "/homework", labelKey: "homework", icon: ClipboardList, roles: ["ADMIN", "TEACHER", "STUDENT"], badge: "homework" },
  { href: "/attendance", labelKey: "attendance", icon: CalendarCheck, roles: ["ADMIN", "TEACHER", "STUDENT"], exact: true },
  { href: "/attendance/teachers", labelKey: "teacherAttendance", icon: CalendarCheck, roles: ["ADMIN", "TEACHER"] },
  { href: "/my-results", labelKey: "myResults", icon: FileText, roles: ["STUDENT"] },
  { href: "/my-children", labelKey: "myChildren", icon: UsersRound, roles: ["PARENT"] },
  { href: "/profile", labelKey: "profile", icon: User, roles: ["ADMIN", "TEACHER", "STUDENT", "PARENT"] },
];

function useBadgeCount(endpoint: string, enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCount(data.count || 0);
        }
      } catch { /* ignore */ }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [endpoint, enabled]);
  return count;
}

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Раскрытые группы; группа с активным подпунктом раскрыта по умолчанию
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const homeworkCount = useBadgeCount("/api/homework/count", true);
  const requestsCount = useBadgeCount(
    "/api/enrollment-requests/count",
    role === "ADMIN" || role === "TEACHER"
  );
  const debtorsCount = useBadgeCount("/api/debtors/count", role === "ADMIN");
  const badgeCounts = {
    homework: homeworkCount,
    enrollmentRequests: requestsCount,
    debtors: debtorsCount,
  } as const;

  const filteredItems = navItems.filter((item) => item.roles.includes(role));
  const lessonRoute = matchLessonRoute(pathname);

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 border-b py-5", collapsed ? "justify-center px-2" : "px-6")}>
        <Image src="/logo.png" alt="" width={490} height={492} className="h-7 w-auto shrink-0" />
        {!collapsed && <span className="text-lg font-semibold">Best Direction</span>}
      </div>

      {lessonRoute ? (
        <LessonSidebarNav
          courseSlug={lessonRoute.courseSlug}
          activeLessonSlug={lessonRoute.lessonSlug}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      ) : (
      <nav className={cn("flex-1 min-h-0 overflow-y-auto space-y-1", collapsed ? "p-2" : "p-4")}>
        <TooltipProvider delayDuration={0}>
          {filteredItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            const badgeCount = item.badge ? badgeCounts[item.badge] : 0;

            if (item.children && !collapsed) {
              const isOpen = openGroups[item.href] ?? isActive;
              return (
                <div key={item.href}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((prev) => ({ ...prev, [item.href]: !isOpen }))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive && !isOpen
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{t(item.labelKey)}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 transition-transform", !isOpen && "-rotate-90")}
                    />
                  </button>
                  {isOpen && (
                    <div className="ml-4 mt-1 space-y-1 border-l pl-3">
                      {item.children.map((child) => {
                        // Точное совпадение, чтобы /admin/landing не подсвечивался на /admin/landing/pages
                        const childActive =
                          pathname === child.href ||
                          (child.href !== item.href && pathname.startsWith(child.href + "/"));
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",
                              childActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {t(child.labelKey)}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg py-2 text-sm transition-colors",
                  collapsed ? "justify-center px-2" : "px-3",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex items-center justify-between flex-1">
                    <span>{t(item.labelKey)}</span>
                    {badgeCount > 0 && (
                      <Badge variant={isActive ? "secondary" : "default"} className="ml-auto text-xs h-5 min-w-5 flex items-center justify-center">
                        {badgeCount}
                      </Badge>
                    )}
                  </span>
                )}
                {collapsed && badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                    {badgeCount}
                  </span>
                )}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}
        </TooltipProvider>
      </nav>
      )}

      <div className={cn("border-t", collapsed ? "p-2" : "p-4")}>
        {!collapsed && (
          <div className="mb-3 px-3">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground mb-2">{tRoles(role)}</p>
            <LanguageSwitcher />
          </div>
        )}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "w-full text-muted-foreground",
                  collapsed ? "justify-center px-2" : "justify-start gap-3"
                )}
                onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!collapsed && tAuth("logout")}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">{tAuth("logout")}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 border-r bg-card transition-all md:translate-x-0 md:static md:z-auto md:h-screen",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0 w-64" : "-translate-x-full"
        )}
      >
        {sidebarContent}

        {/* Desktop collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-3 top-20 hidden md:flex h-6 w-6 rounded-full border bg-card shadow-sm"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronsRight className="h-3 w-3" />
          ) : (
            <ChevronsLeft className="h-3 w-3" />
          )}
        </Button>
      </aside>
    </>
  );
}
