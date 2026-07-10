import { Input, Label } from "lms";

export const Default = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <Label htmlFor="fullName">Имя студента</Label>
    <Input id="fullName" placeholder="Алишер Каримов" />
  </div>
);

export const Filled = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <Label htmlFor="phone">Телефон</Label>
    <Input id="phone" type="tel" defaultValue="+998 90 123-45-67" />
  </div>
);

export const WithError = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <Label htmlFor="phone-err">Телефон</Label>
    <Input
      id="phone-err"
      type="tel"
      defaultValue="90 123"
      className="border-destructive"
      aria-invalid
    />
    <p className="text-sm text-destructive">
      Введите номер в формате +998 XX XXX-XX-XX
    </p>
  </div>
);

export const Disabled = () => (
  <div className="space-y-2" style={{ width: 320 }}>
    <Label htmlFor="group">Группа</Label>
    <Input id="group" defaultValue="Группа А-1 (Веб-разработка)" disabled />
    <p className="text-sm text-muted-foreground">
      Группу назначает администратор
    </p>
  </div>
);
