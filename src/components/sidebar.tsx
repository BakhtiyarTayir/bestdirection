"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  FileText,
  User,
  GraduationCap,
  LogOut,
  Menu,
  X,
  Trash2,
  ScrollText,
  Copy,
  GitCompare,
  ChevronsLeft,
  ChevronsRight,
  UsersRound,
  ClipboardList,
  BarChart3,
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

interface SidebarProps {
  role: string;
  userName: string;
}

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  roles: string[];
  badge?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/courses", labelKey: "courses", icon: BookOpen, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/users", labelKey: "users", icon: Users, roles: ["ADMIN", "TEACHER"] },
  { href: "/users/statistics", labelKey: "homeworkStats", icon: BarChart3, roles: ["ADMIN", "TEACHER"] },
  { href: "/groups", labelKey: "groups", icon: UsersRound, roles: ["ADMIN", "TEACHER"] },
  { href: "/courses/catalog", labelKey: "catalog", icon: Copy, roles: ["ADMIN", "TEACHER"] },
  { href: "/admin/compare", labelKey: "compare", icon: GitCompare, roles: ["ADMIN"] },
  { href: "/trash", labelKey: "trash", icon: Trash2, roles: ["ADMIN"] },
  { href: "/audit", labelKey: "audit", icon: ScrollText, roles: ["ADMIN"] },
  { href: "/homework", labelKey: "homework", icon: ClipboardList, roles: ["ADMIN", "TEACHER", "STUDENT"], badge: true },
  { href: "/my-results", labelKey: "myResults", icon: FileText, roles: ["STUDENT"] },
  { href: "/profile", labelKey: "profile", icon: User, roles: ["ADMIN", "TEACHER", "STUDENT"] },
];

function useHomeworkCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/homework/count");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCount(data.count || 0);
        }
      } catch { /* ignore */ }
    }
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);
  return count;
}

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations("nav");
  const tRoles = useTranslations("roles");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const homeworkCount = useHomeworkCount();

  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center gap-2 border-b", collapsed ? "justify-center px-2" : "px-6")}>
        <GraduationCap className="h-6 w-6 text-primary shrink-0" />
        {!collapsed && <span className="text-lg font-semibold">LMS</span>}
      </div>

      <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-4")}>
        <TooltipProvider delayDuration={0}>
          {filteredItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const badgeCount = item.badge ? homeworkCount : 0;
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
          "fixed inset-y-0 left-0 z-40 border-r bg-card transition-all md:translate-x-0 md:static md:z-auto",
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
