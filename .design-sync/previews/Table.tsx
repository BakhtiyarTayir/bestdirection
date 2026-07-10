import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "lms";

const students = [
  { name: "Алишер Каримов", group: "FR-24-01", role: "STUDENT", attendance: 96 },
  { name: "Мария Ким", group: "FR-24-01", role: "STUDENT", attendance: 88 },
  { name: "Тимур Юсупов", group: "BE-24-02", role: "STUDENT", attendance: 74 },
  { name: "Дилноза Рахимова", group: "FR-24-01", role: "STUDENT", attendance: 91 },
  { name: "Сергей Ло", group: "BE-24-02", role: "STUDENT", attendance: 59 },
];

export const StudentList = () => (
  <div style={{ width: 640 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Студент</TableHead>
          <TableHead>Группа</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Посещаемость</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((s) => (
          <TableRow key={s.name}>
            <TableCell className="font-medium">{s.name}</TableCell>
            <TableCell>{s.group}</TableCell>
            <TableCell>
              <Badge variant={s.attendance < 60 ? "destructive" : "secondary"}>
                {s.attendance < 60 ? "Риск отчисления" : "Активен"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{s.attendance}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const GradesWithFooter = () => (
  <div style={{ width: 560 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Задание</TableHead>
          <TableHead>Срок сдачи</TableHead>
          <TableHead className="text-right">Баллы</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Вёрстка страницы курса</TableCell>
          <TableCell>12 июля</TableCell>
          <TableCell className="text-right">18 / 20</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Тест: основы JavaScript</TableCell>
          <TableCell>19 июля</TableCell>
          <TableCell className="text-right">14 / 15</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Проект: список задач</TableCell>
          <TableCell>26 июля</TableCell>
          <TableCell className="text-right">27 / 30</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Итоговый экзамен</TableCell>
          <TableCell>2 августа</TableCell>
          <TableCell className="text-right">32 / 35</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Итого за модуль</TableCell>
          <TableCell className="text-right">91 / 100</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  </div>
);
