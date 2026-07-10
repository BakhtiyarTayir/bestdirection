import { ScrollArea, ScrollBar, Separator, Badge } from "lms";

const lessons = [
  "Урок 1. Введение в HTML",
  "Урок 2. Семантическая разметка",
  "Урок 3. Основы CSS",
  "Урок 4. Flexbox и Grid",
  "Урок 5. Адаптивная вёрстка",
  "Урок 6. Введение в JavaScript",
  "Урок 7. Переменные и типы данных",
  "Урок 8. Функции",
  "Урок 9. Массивы и объекты",
  "Урок 10. DOM и события",
  "Урок 11. Асинхронность",
  "Урок 12. Итоговый проект",
];

export const LessonList = () => (
  <ScrollArea
    type="always"
    className="rounded-md border"
    style={{ width: 300, height: 220 }}
  >
    <div className="p-4">
      <h4 className="mb-3 text-sm font-medium">Программа курса</h4>
      {lessons.map((lesson, i) => (
        <div key={lesson}>
          <div className="text-sm">{lesson}</div>
          {i < lessons.length - 1 && <Separator className="mt-2 mb-2" />}
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const GroupsHorizontal = () => (
  <ScrollArea
    type="always"
    className="rounded-md border whitespace-nowrap"
    style={{ width: 340 }}
  >
    <div className="flex gap-4 p-4" style={{ width: "max-content" }}>
      {[
        ["FR-24-01", "Веб-разработка"],
        ["BE-24-02", "Backend на Node.js"],
        ["UX-24-01", "UI/UX-дизайн"],
        ["QA-24-03", "Тестирование ПО"],
        ["PY-24-02", "Python для анализа данных"],
      ].map(([code, title]) => (
        <div key={code} className="rounded-md border p-3" style={{ width: 180 }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{code}</span>
            <Badge variant="secondary">Идёт</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{title}</p>
        </div>
      ))}
    </div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);
