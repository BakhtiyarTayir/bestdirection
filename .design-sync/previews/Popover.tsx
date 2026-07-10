import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
} from "lms";
import { CalendarDays, Filter } from "lucide-react";

export const StudentCard = () => (
  <div className="flex justify-center" style={{ height: 260 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="link">Азиз Каримов</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex gap-3">
          <Avatar>
            <AvatarFallback>АК</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Азиз Каримов</p>
              <Badge variant="secondary">Студент</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Группа «Веб-разработка А-1», посещаемость 92%
            </p>
            <div className="flex items-center text-xs text-muted-foreground">
              <CalendarDays className="mr-1 h-3 w-3" />
              На курсе с 12 марта 2026
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

export const JournalFilter = () => (
  <div className="flex justify-center" style={{ height: 320 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Фильтр журнала
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Фильтр по периоду</h4>
            <p className="text-sm text-muted-foreground">
              Показать посещаемость за выбранные даты
            </p>
          </div>
          <Separator />
          <div className="grid gap-2">
            <Label htmlFor="date-from">С даты</Label>
            <Input id="date-from" defaultValue="01.07.2026" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date-to">По дату</Label>
            <Input id="date-to" defaultValue="10.07.2026" />
          </div>
          <Button size="sm" className="w-full">
            Применить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

export const TriggerOnly = () => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline">Расписание занятий</Button>
    </PopoverTrigger>
  </Popover>
);
