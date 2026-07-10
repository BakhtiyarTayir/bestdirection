import { Label, Textarea } from "lms";

export const Default = () => (
  <div className="space-y-2" style={{ width: 360 }}>
    <Label htmlFor="message">Комментарий</Label>
    <Textarea
      id="message"
      placeholder="Расскажите, какой курс вас интересует и в какое время удобно заниматься"
    />
  </div>
);

export const Filled = () => (
  <div className="space-y-2" style={{ width: 360 }}>
    <Label htmlFor="homework-comment">Комментарий преподавателя</Label>
    <Textarea
      id="homework-comment"
      defaultValue={
        "Домашняя работа выполнена хорошо. Обратите внимание на отступы в разметке и переименуйте переменные согласно стайл-гайду."
      }
    />
    <p className="text-sm text-muted-foreground">
      Студент увидит комментарий после проверки
    </p>
  </div>
);

export const Disabled = () => (
  <div className="space-y-2" style={{ width: 360 }}>
    <Label htmlFor="archived-note">Заметка о занятии</Label>
    <Textarea
      id="archived-note"
      defaultValue="Группа Б-2 перенесена на 18:00 по просьбе студентов."
      disabled
    />
  </div>
);
