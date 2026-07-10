import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Progress,
} from "lms";

export const CourseCard = () => (
  <Card className="w-[360px]">
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle>Веб-разработка с нуля</CardTitle>
        <Badge>Идёт набор</Badge>
      </div>
      <CardDescription>
        HTML, CSS, JavaScript и React за 6 месяцев — от первой строки кода до
        собственного проекта в портфолио.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Старт потока</span>
        <span className="font-medium">1 августа</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Осталось мест</span>
        <span className="font-medium">7 из 20</span>
      </div>
    </CardContent>
    <CardFooter className="gap-3">
      <Button className="flex-1">Записаться</Button>
      <Button variant="outline">Программа</Button>
    </CardFooter>
  </Card>
);

export const ProgressCard = () => (
  <Card className="w-[360px]">
    <CardHeader>
      <CardTitle>Прогресс обучения</CardTitle>
      <CardDescription>Модуль 3 — Основы JavaScript</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      <Progress value={68} />
      <p className="text-sm text-muted-foreground">17 из 25 уроков пройдено</p>
    </CardContent>
  </Card>
);

export const SimpleCard = () => (
  <Card className="w-[360px]">
    <CardHeader>
      <CardTitle>Домашнее задание</CardTitle>
      <CardDescription>Срок сдачи — пятница, 18:00</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm">
        Сверстать адаптивную страницу курса по макету и загрузить ссылку на
        репозиторий.
      </p>
    </CardContent>
  </Card>
);
