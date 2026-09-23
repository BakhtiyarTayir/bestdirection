"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { createPayment } from "@/lib/api/billing";
import { refreshBadges } from "@/lib/badge-refresh";
import { paymentMethods, type PaymentMethodValue } from "@/validators/payment";
import { Plus, Search } from "lucide-react";
import type { PaymentStudentOption } from "./payments-list";

/** Текущий месяц как "YYYY-MM" — период оплаты по умолчанию */
function currentMonth() {
  return format(new Date(), "yyyy-MM");
}

/** Студент, курс и сумма, подставляемые при открытии извне. */
export interface PaymentPrefill {
  studentId: string;
  courseId: string;
  amount: number;
  forMonth?: string;
}

interface CreatePaymentDialogProps {
  students: PaymentStudentOption[];
  /**
   * Управление извне: диалог перестаёт рисовать свою кнопку и открывается
   * родителем — так строка должника вносит оплату уже с заполненными полями.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prefill?: PaymentPrefill | null;
  onCreated?: () => void;
}

export function CreatePaymentDialog({
  students,
  open: controlledOpen,
  onOpenChange,
  prefill,
  onCreated,
}: CreatePaymentDialogProps) {
  const t = useTranslations("payments");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { toast } = useToast();

  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethodValue>("CASH");
  const [paidAt, setPaidAt] = useState<Date | undefined>(new Date());
  const [forMonth, setForMonth] = useState(currentMonth());
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const student = students.find((s) => s.id === studentId) ?? null;
  const enrollment =
    student?.enrollments.find((e) => e.courseId === courseId) ?? null;

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students.slice(0, 50);
    return students
      .filter((s) =>
        `${s.lastName} ${s.firstName} ${s.phone ?? ""}`.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [students, search]);

  // Подставляем один раз на открытие: иначе повторные рендеры родителя
  // затирали бы то, что админ успел поправить руками.
  const prefillKey = prefill
    ? `${prefill.studentId}:${prefill.courseId}:${prefill.amount}:${prefill.forMonth ?? ""}`
    : null;
  const appliedPrefill = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      appliedPrefill.current = null;
      return;
    }
    if (!prefill || !prefillKey || appliedPrefill.current === prefillKey) return;
    appliedPrefill.current = prefillKey;
    setStudentId(prefill.studentId);
    setCourseId(prefill.courseId);
    setAmount(String(prefill.amount));
    setForMonth(prefill.forMonth ?? currentMonth());
  }, [open, prefill, prefillKey]);

  const reset = () => {
    setSearch("");
    setStudentId("");
    setCourseId("");
    setAmount("");
    setMethod("CASH");
    setPaidAt(new Date());
    setForMonth(currentMonth());
    setComment("");
  };

  const selectStudent = (id: string) => {
    setStudentId(id);
    const picked = students.find((s) => s.id === id);
    // Единственный курс подставляем сразу вместе с ценой — обычный случай
    if (picked && picked.enrollments.length === 1) {
      const only = picked.enrollments[0];
      setCourseId(only.courseId);
      setAmount(only.price !== null ? String(only.price) : "");
    } else {
      setCourseId("");
      setAmount("");
    }
  };

  const selectCourse = (id: string) => {
    setCourseId(id);
    const picked = student?.enrollments.find((e) => e.courseId === id);
    if (picked?.price != null) setAmount(String(picked.price));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const amountValue = Number(amount);
    if (!studentId || !courseId || !paidAt || !Number.isInteger(amountValue) || amountValue <= 0) {
      toast({
        title: tErrors("error"),
        description: t("fillRequiredFields"),
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await createPayment({
        studentId,
        courseId,
        amount: amountValue,
        method,
        // Календарная дата строкой: Date уехал бы на сутки при UTC-сериализации
        paidAt: format(paidAt, "yyyy-MM-dd"),
        forMonth: forMonth || undefined,
        comment: comment.trim() || undefined,
      });

      if (result.success) {
        toast({ title: t("createdToast") });
        reset();
        setOpen(false);
        onCreated?.();
        refreshBadges();
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description:
            result.error === "notEnrolled"
              ? t("notEnrolled")
              : result.error === "groupMismatch"
                ? t("groupMismatch")
                : t("createFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("addPayment")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newPayment")}</DialogTitle>
          <DialogDescription>{t("newPaymentDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("colStudent")}</Label>
            {student ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">
                    {student.lastName} {student.firstName}
                  </div>
                  {student.phone && (
                    <div className="text-xs text-muted-foreground">{student.phone}</div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStudentId("");
                    setCourseId("");
                    setAmount("");
                  }}
                >
                  {t("changeStudent")}
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder={t("searchStudent")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  {filteredStudents.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      {t("noStudentsFound")}
                    </p>
                  ) : (
                    filteredStudents.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStudent(s.id)}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span>
                          {s.lastName} {s.firstName}
                        </span>
                        {s.phone && (
                          <span className="text-xs text-muted-foreground">{s.phone}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {student && (
            <div className="space-y-2">
              <Label>{t("colCourse")}</Label>
              <Select value={courseId} onValueChange={selectCourse}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectCourse")} />
                </SelectTrigger>
                <SelectContent>
                  {student.enrollments.map((e) => (
                    <SelectItem key={e.courseId} value={e.courseId}>
                      {e.courseTitle}
                      {e.groupName ? ` — ${e.groupName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {enrollment?.groupName && (
                <p className="text-xs text-muted-foreground">
                  {t("groupLabel")}: {enrollment.groupName}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payment-amount">{t("colAmount")} (UZS)</Label>
              <Input
                id="payment-amount"
                type="number"
                // step задаёт не только шаг стрелок, но и сетку валидации min + n*step:
                // при step=1000 браузер отвергал любую сумму, не кончающуюся на 001
                min={1}
                step={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500000"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("colMethod")}</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as PaymentMethodValue)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`method.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("colPaidAt")}</Label>
              <DatePicker value={paidAt} onChange={setPaidAt} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-month">{t("colForMonth")}</Label>
              <Input
                id="payment-month"
                type="month"
                value={forMonth}
                onChange={(e) => setForMonth(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-comment">{t("commentOptional")}</Label>
            <Textarea
              id="payment-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("commentPlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSaving || !studentId || !courseId}>
              {isSaving ? tCommon("saving") : t("savePayment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
