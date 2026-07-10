import { Badge } from "lms";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Badge>Идёт набор</Badge>
    <Badge variant="secondary">Черновик</Badge>
    <Badge variant="destructive">Просрочено</Badge>
    <Badge variant="outline">Архив</Badge>
  </div>
);

export const UserRoles = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Badge variant="destructive">Администратор</Badge>
    <Badge>Преподаватель</Badge>
    <Badge variant="secondary">Студент</Badge>
  </div>
);

export const InContext = () => (
  <div className="space-y-2 text-sm" style={{ width: 360 }}>
    <div className="flex items-center justify-between">
      <span className="font-medium">Вёрстка страницы курса</span>
      <Badge variant="secondary">Проверено</Badge>
    </div>
    <div className="flex items-center justify-between">
      <span className="font-medium">Тест: основы JavaScript</span>
      <Badge>На проверке</Badge>
    </div>
    <div className="flex items-center justify-between">
      <span className="font-medium">Проект: список задач</span>
      <Badge variant="destructive">Не сдано</Badge>
    </div>
  </div>
);
