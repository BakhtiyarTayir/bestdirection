"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/format-date";
import { Trash2, Loader2 } from "lucide-react";
import { deletePayment } from "@/actions/payment-actions";
import { paymentMethods, type PaymentMethodValue } from "@/validators/payment";
import { CreatePaymentDialog } from "./create-payment-dialog";

export interface PaymentStudentOption {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  enrollments: {
    courseId: string;
    courseTitle: string;
    price: number | null;
    groupId: string | null;
    groupName: string | null;
  }[];
}

interface PaymentRow {
  id: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  forMonth: string | null;
  comment: string | null;
  student: { firstName: string; lastName: string; phone: string | null };
  course: { title: string };
  group: { name: string } | null;
  createdBy: { firstName: string; lastName: string };
}

interface PaymentsListProps {
  payments: PaymentRow[];
  total: number;
  count: number;
  filters: { month?: string; courseId?: string; method?: PaymentMethodValue };
  students: PaymentStudentOption[];
  courses: { id: string; title: string }[];
}

/** Значение-заглушка для «все»: SelectItem не принимает пустую строку */
const ALL = "all";

export function PaymentsList({
  payments,
  total,
  count,
  filters,
  students,
  courses,
}: PaymentsListProps) {
  const t = useTranslations("payments");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const amountFormatter = new Intl.NumberFormat(locale === "uz" ? "uz-UZ" : "ru-RU");

  // Фильтры живут в URL: страница серверная, ссылка на отфильтрованный журнал шарится
  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams();
    const next = { ...filters, [key]: value === ALL ? "" : value };
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deletePayment(id);
      if (result.success) {
        toast({ title: t("deletedToast") });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: t("deleteFailed"),
          variant: "destructive",
        });
      }
      setDeletingId(null);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="filter-month" className="text-xs text-muted-foreground">
              {t("filterMonth")}
            </Label>
            <Input
              id="filter-month"
              type="month"
              className="w-40"
              value={filters.month ?? ""}
              onChange={(e) => setFilter("month", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("filterCourse")}</Label>
            <Select
              value={filters.courseId ?? ALL}
              onValueChange={(value) => setFilter("courseId", value)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder={t("allCourses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allCourses")}</SelectItem>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("filterMethod")}</Label>
            <Select
              value={filters.method ?? ALL}
              onValueChange={(value) => setFilter("method", value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("allMethods")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allMethods")}</SelectItem>
                {paymentMethods.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`method.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <CreatePaymentDialog students={students} />
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3">
        <div className="text-sm text-muted-foreground">{t("totalLabel")}</div>
        <div className="text-2xl font-bold">{amountFormatter.format(total)} UZS</div>
        <div className="text-sm text-muted-foreground">
          {t("paymentsCount", { count })}
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPaidAt")}</TableHead>
                <TableHead>{t("colStudent")}</TableHead>
                <TableHead>{t("colCourse")}</TableHead>
                <TableHead>{t("colForMonth")}</TableHead>
                <TableHead>{t("colMethod")}</TableHead>
                <TableHead className="text-right">{t("colAmount")}</TableHead>
                <TableHead>{t("colRecordedBy")}</TableHead>
                <TableHead className="text-right">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(payment.paidAt)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {payment.student.lastName} {payment.student.firstName}
                    </div>
                    {payment.student.phone && (
                      <div className="text-sm text-muted-foreground">
                        {payment.student.phone}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{payment.course.title}</div>
                    {payment.group && (
                      <div className="text-sm text-muted-foreground">
                        {payment.group.name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {payment.forMonth ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`method.${payment.method}`)}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">
                    {amountFormatter.format(payment.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.createdBy.lastName} {payment.createdBy.firstName}
                    {payment.comment && (
                      <div className="text-xs italic">{payment.comment}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deletingId === payment.id}
                          aria-label={t("deletePayment")}
                        >
                          {deletingId === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deletePayment")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteConfirm", {
                              amount: amountFormatter.format(payment.amount),
                              student: `${payment.student.lastName} ${payment.student.firstName}`,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("cancelDelete")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(payment.id)}>
                            {t("confirmDelete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
