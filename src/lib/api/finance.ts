// Отчёт «Финансы» (GET /finance): прибыль центра по кассе и по начислениям

export interface ApiFinanceMonth {
  month: string;
  /** Касса: оплаты учеников, принятые в этом месяце */
  received: number;
  /** Касса: выплаты преподавателям, выданные в этом месяце */
  paidOut: number;
  cashProfit: number;
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
