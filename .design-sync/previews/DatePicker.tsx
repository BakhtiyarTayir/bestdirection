import { DatePicker, DsIntlProvider } from "lms";

export const WithValue = () => (
  <DsIntlProvider>
  <div className="space-y-2" style={{ width: 280 }}>
    <p className="text-sm font-medium">Дата начала курса</p>
    <DatePicker value={new Date(2026, 6, 15)} onChange={() => {}} />
  </div>
  </DsIntlProvider>
);

export const Placeholder = () => (
  <DsIntlProvider>
  <div className="space-y-2" style={{ width: 280 }}>
    <p className="text-sm font-medium">Дедлайн домашнего задания</p>
    <DatePicker onChange={() => {}} placeholder="Выберите дату" />
  </div>
  </DsIntlProvider>
);
