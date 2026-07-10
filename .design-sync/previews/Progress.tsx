import { Progress } from "lms";

export const CourseCompletion = () => (
  <div className="space-y-6" style={{ width: 360 }}>
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Основы JavaScript</span>
        <span className="text-muted-foreground">25%</span>
      </div>
      <Progress value={25} />
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Веб-разработка</span>
        <span className="text-muted-foreground">68%</span>
      </div>
      <Progress value={68} />
    </div>
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">HTML и CSS</span>
        <span className="text-muted-foreground">100%</span>
      </div>
      <Progress value={100} />
    </div>
  </div>
);

export const CompactHomework = () => (
  <div className="space-y-3" style={{ width: 300 }}>
    <p className="text-sm font-medium">Проверка домашних заданий</p>
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Группа ФР-101 — проверено 12 из 28</p>
      <Progress value={43} className="h-2" />
    </div>
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">Группа ФР-102 — проверено 25 из 30</p>
      <Progress value={83} className="h-2" />
    </div>
  </div>
);

export const Empty = () => (
  <div className="space-y-2" style={{ width: 360 }}>
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium">Итоговый проект</span>
      <span className="text-muted-foreground">0%</span>
    </div>
    <Progress value={0} />
    <p className="text-xs text-muted-foreground">Модуль откроется после завершения курса</p>
  </div>
);
