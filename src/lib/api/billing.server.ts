import "server-only";
import type {
  ApiDebtors,
  ApiPaymentFormOptions,
  ApiPaymentsPage,
  ApiStudentBilling,
  ApiStudentsOverview,
  PaymentMethodValue,
} from "./billing";
import { apiServerFetch } from "./server";

// Те же маршруты биллинга для серверных компонентов, см. users.server.

export const getDebtors = (
  query: { month?: string; courseId?: string; groupId?: string; branchId?: string } = {}
) => apiServerFetch<ApiDebtors>("/billing/debtors", { query });

export const getDebtorsCount = () => apiServerFetch<{ count: number }>("/billing/debtors/count");

export const getStudentsOverview = (branchId?: string) =>
  apiServerFetch<ApiStudentsOverview[]>("/billing/students", { query: { branchId } });

export const getStudentBilling = (studentId: string) =>
  apiServerFetch<ApiStudentBilling>(`/billing/students/${studentId}`);

export const getPayments = (
  query: {
    month?: string;
    courseId?: string;
    groupId?: string;
    studentId?: string;
    method?: PaymentMethodValue;
    branchId?: string;
  } = {}
) => apiServerFetch<ApiPaymentsPage>("/billing/payments", { query });

export const getPaymentFormOptions = () =>
  apiServerFetch<ApiPaymentFormOptions>("/billing/payments/form-options");
