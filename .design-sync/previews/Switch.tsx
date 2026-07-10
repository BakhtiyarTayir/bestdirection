import { Label, Switch } from "lms";

export const Default = () => (
  <div className="flex items-center space-x-2">
    <Switch id="isPublished" />
    <Label htmlFor="isPublished">Опубликовать курс</Label>
  </div>
);

export const Checked = () => (
  <div className="flex items-center space-x-2">
    <Switch id="allowLate" defaultChecked />
    <Label htmlFor="allowLate">Разрешить сдачу после дедлайна</Label>
  </div>
);

export const Disabled = () => (
  <div className="space-y-3">
    <div className="flex items-center space-x-2">
      <Switch id="dis-off" disabled />
      <Label htmlFor="dis-off">Открытая запись на курс</Label>
    </div>
    <div className="flex items-center space-x-2">
      <Switch id="dis-on" disabled defaultChecked />
      <Label htmlFor="dis-on">Видеоурок прикреплён</Label>
    </div>
  </div>
);

export const SettingsRow = () => (
  <div
    className="flex items-center justify-between rounded-lg border p-4"
    style={{ width: 380 }}
  >
    <div className="space-y-1">
      <Label htmlFor="notify">Уведомления о домашних заданиях</Label>
      <p className="text-sm text-muted-foreground">
        Напоминать студентам за день до дедлайна
      </p>
    </div>
    <Switch id="notify" defaultChecked />
  </div>
);
