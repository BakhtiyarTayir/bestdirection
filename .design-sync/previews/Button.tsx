import { Button } from "lms";
import { Loader2, Plus, Trash2 } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Сохранить</Button>
    <Button variant="secondary">Отмена</Button>
    <Button variant="outline">Экспорт</Button>
    <Button variant="ghost">Подробнее</Button>
    <Button variant="link">Открыть курс</Button>
    <Button variant="destructive">Удалить</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="lg">Записаться на курс</Button>
    <Button>Сохранить</Button>
    <Button size="sm">Фильтр</Button>
    <Button size="icon" aria-label="Добавить">
      <Plus className="h-4 w-4" />
    </Button>
  </div>
);

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Недоступно</Button>
    <Button disabled>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Сохранение…
    </Button>
    <Button variant="outline">
      <Trash2 className="mr-2 h-4 w-4" />
      Удалить урок
    </Button>
  </div>
);
