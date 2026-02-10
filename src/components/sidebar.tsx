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
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "./ui/button";
import { useState } from "react";

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

  const filteredItems = navItems.filter((item) => item.roles.includes(role));

  const roleLabels: Record<string, string> = {
    ADMIN: "Администратор",
    TEACHER: "Преподаватель",
    STUDENT: "Студент",
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <GraduationCap className="h-6 w-6 text-primary" />
        <span className="text-lg font-semibold">LMS</span>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="mb-3 px-3">
          <p className="text-sm font-medium truncate">{userName}</p>
          <p className="text-xs text-muted-foreground">{roleLabels[role] || role}</p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </Button>
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
          "fixed inset-y-0 left-0 z-40 w-64 border-r bg-card transition-transform md:translate-x-0 md:static md:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
