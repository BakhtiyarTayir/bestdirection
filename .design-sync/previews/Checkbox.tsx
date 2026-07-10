import { Checkbox, Label } from "lms";

export const Default = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="offer" />
    <Label htmlFor="offer">Согласен с публичной офертой</Label>
  </div>
);

export const Checked = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="sms" defaultChecked />
    <Label htmlFor="sms">Отправлять SMS-уведомления о занятиях</Label>
  </div>
);

export const Disabled = () => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Checkbox id="dis-off" disabled />
      <Label htmlFor="dis-off">Доступ к архиву уроков</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="dis-on" disabled defaultChecked />
      <Label htmlFor="dis-on">Зачислен в группу А-1</Label>
    </div>
  </div>
);

export const StudentList = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <p className="text-sm font-medium">Добавить студентов в группу Б-2</p>
    <div className="flex items-center gap-3 rounded-lg p-2">
      <Checkbox id="st-1" defaultChecked />
      <Label htmlFor="st-1" className="font-normal">
        Алишер Каримов
      </Label>
    </div>
    <div className="flex items-center gap-3 rounded-lg p-2">
      <Checkbox id="st-2" defaultChecked />
      <Label htmlFor="st-2" className="font-normal">
        Мадина Юсупова
      </Label>
    </div>
    <div className="flex items-center gap-3 rounded-lg p-2">
      <Checkbox id="st-3" />
      <Label htmlFor="st-3" className="font-normal">
        Тимур Рахимов
      </Label>
    </div>
  </div>
);
