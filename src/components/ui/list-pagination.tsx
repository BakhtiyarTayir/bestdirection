"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./button";

/** Сколько строк показывает любой список людей на одной странице */
export const LIST_PAGE_SIZE = 20;

/**
 * Пагинация списка на клиенте. resetKey — то, от чего зависит состав списка
 * (поиск, фильтры): при его смене список начинается с первой страницы.
 * Ключ, а не сам массив: массив пересоздаётся и после обычной правки строки
 * (отметили заявку, обновили страницу) — и тогда список прыгал бы на начало.
 */
export function usePagination<T>(items: T[], resetKey: unknown = null, pageSize = LIST_PAGE_SIZE) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  const requested = Object.is(state.key, resetKey) ? state.page : 1;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Строк стало меньше (удалили, отфильтровали) — остаёмся на последней странице
  const page = Math.min(requested, totalPages);
  const offset = (page - 1) * pageSize;

  return {
    page,
    totalPages,
    /** Номер первой строки страницы минус один — для сквозной нумерации */
    offset,
    pageItems: items.slice(offset, offset + pageSize),
    setPage: (next: number) => setState({ page: next, key: resetKey }),
  };
}

interface ListPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function ListPagination({ page, totalPages, onPageChange }: ListPaginationProps) {
  const t = useTranslations("common");

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-muted-foreground">{t("page", { page, totalPages })}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
