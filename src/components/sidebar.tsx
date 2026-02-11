"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  ClipboardCheck,
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
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "./ui/button";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface SidebarProps {
  role: string;
  userName: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: string[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/courses", label: "Курсы", icon: BookOpen, roles: ["ADMIN", "TEACHER", "STUDENT"] },
  { href: "/users", label: "Пользователи", icon: Users, roles: ["ADMIN"] },
  { href: "/groups", label: "Группы", icon: UsersRound, roles: ["ADMIN", "TEACHER"] },
  { href: "/courses/catalog", label: "Каталог курсов", icon: Copy, roles: ["ADMIN", "TEACHER"] },
  { href: "/admin/compare", label: "Сравнение курсов", icon: GitCompare, roles: ["ADMIN"] },
  { href: "/trash", label: "Корзина", icon: Trash2, roles: ["ADMIN"] },
  { href: "/audit", label: "Журнал аудита", icon: ScrollText, roles: ["ADMIN"] },
  { href: "/my-results", label: "Мои результаты", icon: FileText, roles: ["STUDENT"] },
  { href: "/profile", label: "Профиль", icon: User, roles: ["ADMIN", "TEACHER", "STUDENT"] },
];

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  const roleLabels: Record<string, string> = {
    ADMIN: "Администратор",
    TEACHER: "Преподаватель",
    STUDENT: "Студент",
  };

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
                {!collapsed && item.label}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
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
            <p className="text-xs text-muted-foreground">{roleLabels[role] || role}</p>
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
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!collapsed && "Выйти"}
              </Button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Выйти</TooltipContent>}
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
