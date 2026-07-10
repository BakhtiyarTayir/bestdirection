import { Separator } from "lms";

export const CourseMeta = () => (
  <div style={{ width: 360 }}>
    <div className="space-y-1">
      <h4 className="text-sm font-medium">Веб-разработка с нуля</h4>
      <p className="text-sm text-muted-foreground">
        Программа курса и расписание занятий группы FR-24-01.
      </p>
    </div>
    <Separator className="mt-4 mb-4" />
    <div className="flex h-5 items-center gap-4 text-sm">
      <span>24 урока</span>
      <Separator orientation="vertical" />
      <span>6 месяцев</span>
      <Separator orientation="vertical" />
      <span>12 студентов</span>
    </div>
  </div>
);

export const SectionDivider = () => (
  <div className="space-y-4 text-sm" style={{ width: 360 }}>
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">Домашних заданий сдано</span>
      <span className="font-medium">14 из 16</span>
    </div>
    <Separator />
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">Средний балл</span>
      <span className="font-medium">4,6</span>
    </div>
    <Separator />
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">Посещаемость</span>
      <span className="font-medium">91%</span>
    </div>
  </div>
);
