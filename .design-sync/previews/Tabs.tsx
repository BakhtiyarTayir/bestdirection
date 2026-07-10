import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "lms";

export const CourseSections = () => (
  <Tabs defaultValue="materials" style={{ width: 480 }}>
    <TabsList>
      <TabsTrigger value="materials">Материалы</TabsTrigger>
      <TabsTrigger value="homework">Домашние задания</TabsTrigger>
      <TabsTrigger value="students">Студенты</TabsTrigger>
    </TabsList>
    <TabsContent value="materials">
      <Card>
        <CardHeader>
          <CardTitle>Модуль 3 — Основы JavaScript</CardTitle>
          <CardDescription>8 уроков · 3 практических занятия</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Урок 12. Переменные и типы данных</span>
            <Badge variant="secondary">Пройден</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Урок 13. Функции и области видимости</span>
            <Badge>Текущий</Badge>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
    <TabsContent value="homework">
      <p className="text-sm text-muted-foreground">Список домашних заданий.</p>
    </TabsContent>
    <TabsContent value="students">
      <p className="text-sm text-muted-foreground">Студенты группы FR-24-01.</p>
    </TabsContent>
  </Tabs>
);

export const JournalPeriods = () => (
  <Tabs defaultValue="week" style={{ width: 420 }}>
    <TabsList
      className="grid w-full"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      <TabsTrigger value="week">Неделя</TabsTrigger>
      <TabsTrigger value="month">Месяц</TabsTrigger>
      <TabsTrigger value="semester">Семестр</TabsTrigger>
    </TabsList>
    <TabsContent value="week" className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Занятий проведено</span>
        <span className="font-medium">5</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Средняя посещаемость</span>
        <span className="font-medium">87%</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Пропусков без причины</span>
        <span className="font-medium">3</span>
      </div>
    </TabsContent>
    <TabsContent value="month">
      <p className="text-sm text-muted-foreground">Статистика за месяц.</p>
    </TabsContent>
    <TabsContent value="semester">
      <p className="text-sm text-muted-foreground">Статистика за семестр.</p>
    </TabsContent>
  </Tabs>
);
