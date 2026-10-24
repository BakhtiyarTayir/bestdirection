import { apiFetch } from "./client";

// Отчёт «Финансы» (GET /finance): прибыль центра по кассе и по начислениям

export interface ApiFinanceMonth {
  month: string;
  /** Касса: оплаты учеников, принятые в этом месяце */
  received: number;
  /** Касса: выплаты преподавателям, выданные в этом месяце */
  paidOut: number;
  cashProfit: number;
  /** Сдано владельцу из прибыли этого месяца */
  handedOver: number;
  /** Осталось на руках: кассовая прибыль минус сданное */
  onHand: number;
  /** Начисления: сколько ученики должны были заплатить за месяц */
  charged: number;
  /** Начисления: зарплата преподавателей за месяц */
  salaryAccrued: number;
  accrualProfit: number;
}

export interface ApiFinanceTeacher {
  teacherId: string;
  teacherName: string;
  /** Начислено за выбранный месяц */
  accrued: number;
  /** Выдано в выбранном месяце (по дате выдачи) */
  paidOut: number;
}

export interface ApiFinance {
  month: string;
  current: ApiFinanceMonth;
  /** Последние 12 месяцев, новые сверху */
  months: ApiFinanceMonth[];
  teachers: ApiFinanceTeacher[];
}

export interface ApiProfitHandover {
  id: string;
  amount: number;
  handedAt: string;
  forMonth: string;
  receivedBy: string | null;
  comment: string | null;
  branch: { id: string; name: string };
  createdBy: { firstName: string; lastName: string };
}

export interface ApiProfitHandovers {
  handovers: ApiProfitHandover[];
  total: number;
  count: number;
}

export const createHandover = (body: {
  branchId: string;
  amount: number;
  handedAt: string;
  forMonth: string;
  receivedBy?: string;
  comment?: string;
}) => apiFetch<{ id: string }>("/finance/handovers", { method: "POST", body });

export const deleteHandover = (id: string) => apiFetch<{ ok: true }>(`/finance/handovers/${id}`, { method: "DELETE" });
