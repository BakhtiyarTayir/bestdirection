"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchFilterInputProps {
  id?: string;
  /** Значение из адреса страницы — только начальное, дальше поле живёт своим состоянием */
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  className?: string;
  delayMs?: number;
}

/**
 * Поле поиска для фильтров в адресе. Текст хранится локально, а в адрес
 * уходит с задержкой после последнего символа: router не дёргается на каждую
 * букву, а поле не пересоздаётся при обновлении страницы и не теряет фокус.
 */
export function SearchFilterInput({
  id,
  value,
  onSearch,
  placeholder,
  className,
  delayMs = 300,
}: SearchFilterInputProps) {
  const [text, setText] = useState(value);
  // Последнее значение, ушедшее наружу: на первом рендере и после повторного
  // совпадения таймер ничего не отправляет
  const sent = useRef(value);
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    const next = text.trim();
    if (next === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = next;
      onSearchRef.current(next);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [text, delayMs]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type="search"
        className="pl-9"
        maxLength={100}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
