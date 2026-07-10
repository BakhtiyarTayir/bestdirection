import { Calendar } from "lms";

export const SelectedDay = () => (
  <div className="space-y-2">
    <p className="text-sm font-medium">Дата занятия</p>
    <Calendar
      mode="single"
      selected={new Date(2026, 6, 15)}
      month={new Date(2026, 6, 1)}
      className="relative rounded-md border"
      style={{ width: "fit-content" }}
    />
  </div>
);

export const ModuleRange = () => (
  <div className="space-y-2">
    <p className="text-sm font-medium">Период модуля «Основы JavaScript»</p>
    <Calendar
      mode="range"
      selected={{ from: new Date(2026, 6, 6), to: new Date(2026, 6, 17) }}
      month={new Date(2026, 6, 1)}
      className="relative rounded-md border"
      style={{ width: "fit-content" }}
    />
  </div>
);

export const WeekendsDisabled = () => (
  <div className="space-y-2">
    <p className="text-sm font-medium">Запись на консультацию (будни)</p>
    <Calendar
      mode="single"
      selected={new Date(2026, 6, 21)}
      month={new Date(2026, 6, 1)}
      disabled={{ dayOfWeek: [0, 6] }}
      className="relative rounded-md border"
      style={{ width: "fit-content" }}
    />
  </div>
);
