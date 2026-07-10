import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from "lms";
import { Plus, UserPlus } from "lucide-react";

export const CreateGroup = () => (
  <div style={{ height: 460 }}>
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Создать группу
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая группа</DialogTitle>
          <DialogDescription>
            Создайте группу для курса «Веб-разработка». Студентов можно
            добавить после сохранения.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="group-name">Название группы</Label>
            <Input id="group-name" defaultValue="Веб-разработка А-2" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-schedule">Расписание</Label>
            <Input id="group-schedule" defaultValue="Пн, Ср, Пт — 18:00" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">Отмена</Button>
          <Button>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
);

export const HomeworkComment = () => (
  <div style={{ height: 420 }}>
    <Dialog defaultOpen>
      <DialogTrigger asChild>
        <Button variant="outline">Проверить работу</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Комментарий к домашнему заданию</DialogTitle>
          <DialogDescription>
            Урок 12 «Флексбокс и грид» — работа студента Малика Юсупова.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="hw-comment">Комментарий преподавателя</Label>
          <Textarea
            id="hw-comment"
            defaultValue="Хорошая работа! Обратите внимание на отступы в макете."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost">Вернуть на доработку</Button>
          <Button>Принять работу</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
);

export const TriggerOnly = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline">
        <UserPlus className="mr-2 h-4 w-4" />
        Добавить студента
      </Button>
    </DialogTrigger>
  </Dialog>
);
