import { Checkbox, Input, Label } from "lms";

export const WithInput = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <Label htmlFor="student-name">Имя студента</Label>
    <Input id="student-name" placeholder="Алишер Каримов" />
  </div>
);

export const Required = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <Label htmlFor="course-title">
      Название курса <span className="text-destructive">*</span>
    </Label>
    <Input id="course-title" placeholder="Веб-разработка с нуля" />
  </div>
);

export const WithDisabledControl = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="offer-disabled" disabled />
    <Label htmlFor="offer-disabled">Согласен с публичной офертой</Label>
  </div>
);
