import { Label, RadioGroup, RadioGroupItem } from "lms";

export const Default = () => (
  <div className="space-y-3" style={{ width: 360 }}>
    <p className="text-sm font-medium">Какой тег задаёт заголовок первого уровня?</p>
    <RadioGroup defaultValue="h1">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="title" id="q1-a" />
        <Label htmlFor="q1-a" className="font-normal">
          &lt;title&gt;
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="h1" id="q1-b" />
        <Label htmlFor="q1-b" className="font-normal">
          &lt;h1&gt;
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="head" id="q1-c" />
        <Label htmlFor="q1-c" className="font-normal">
          &lt;head&gt;
        </Label>
      </div>
    </RadioGroup>
  </div>
);

export const StudyFormat = () => (
  <div className="space-y-3" style={{ width: 360 }}>
    <Label>Формат обучения</Label>
    <RadioGroup defaultValue="offline">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="online" id="fmt-online" />
        <Label htmlFor="fmt-online" className="font-normal">
          Онлайн — занятия в Zoom
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="offline" id="fmt-offline" />
        <Label htmlFor="fmt-offline" className="font-normal">
          Офлайн — учебный центр в Ташкенте
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="hybrid" id="fmt-hybrid" />
        <Label htmlFor="fmt-hybrid" className="font-normal">
          Гибрид — по расписанию группы
        </Label>
      </div>
    </RadioGroup>
  </div>
);

export const Disabled = () => (
  <div className="space-y-3" style={{ width: 360 }}>
    <Label>Способ оплаты</Label>
    <RadioGroup defaultValue="card" disabled>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="card" id="pay-card" />
        <Label htmlFor="pay-card" className="font-normal">
          Картой Uzcard / Humo
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="cash" id="pay-cash" />
        <Label htmlFor="pay-cash" className="font-normal">
          Наличными в учебном центре
        </Label>
      </div>
    </RadioGroup>
    <p className="text-sm text-muted-foreground">
      Оплата недоступна до подтверждения заявки
    </p>
  </div>
);
