import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "lms";
import {
  BarChart3,
  Edit,
  MoreVertical,
  Power,
  SlidersHorizontal,
  Trash2,
  UserPlus,
} from "lucide-react";

export const GroupActions = () => (
  <div className="flex justify-center" style={{ height: 300 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Группа А-1</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Edit className="mr-2 h-4 w-4" />
          Редактировать
        </DropdownMenuItem>
        <DropdownMenuItem>
          <UserPlus className="mr-2 h-4 w-4" />
          Студенты
        </DropdownMenuItem>
        <DropdownMenuItem>
          <BarChart3 className="mr-2 h-4 w-4" />
          Статистика
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Power className="mr-2 h-4 w-4" />
          Деактивировать
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Удалить
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const TableSettings = () => (
  <div className="flex justify-center" style={{ height: 320 }}>
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Вид таблицы
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" style={{ width: 220 }}>
        <DropdownMenuLabel>Колонки журнала</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked>Посещаемость</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Домашние задания</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Средний балл</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Сортировка студентов</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="name">
          <DropdownMenuRadioItem value="name">По имени</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="grade">По успеваемости</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const TriggerOnly = () => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
  </DropdownMenu>
);
