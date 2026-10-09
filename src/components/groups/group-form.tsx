"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { createGroupSchema, type CreateGroupInput } from "@/validators/group";
import { fromDateInput, toDateInput } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { createGroup, updateGroup } from "@/lib/api/groups";
import { useTranslations } from "next-intl";

interface GroupFormProps {
  courseId: string;
  courseSlug: string;
  group?: {
    id: string;
    name: string;
    branchId: string;
    description: string | null;
    schedule: string | null;
    scheduleDays: number[];
    teacherId: string | null;
    // api отдаёт даты строками ISO
    startDate: Date | string | null;
    endDate: Date | string | null;
    price: number | null;
    salaryPercentBp?: number | null;
  };
  /** Кандидаты в преподаватели группы; пустой список прячет поле */
  teachers?: { id: string; firstName: string; lastName: string }[];
  /** Филиалы — справочник; поле обязательно (решение владельца 2026-09-20) */
  branches: { id: string; name: string }[];
  /**
   * Ставка зарплаты — только у администратора (решение владельца
   * 2026-10-09): сервер отклоняет её изменение преподавателем, поэтому ему
   * поле не показывается и не отправляется. Дату окончания видят все
   */
  canManageMoney: boolean;
}

/** ISO: 1 = понедельник … 7 = воскресенье */
const WEEKDAYS = [
  { iso: 1, key: "mon" },
  { iso: 2, key: "tue" },
  { iso: 3, key: "wed" },
  { iso: 4, key: "thu" },
  { iso: 5, key: "fri" },
  { iso: 6, key: "sat" },
  { iso: 7, key: "sun" },
] as const;

export function GroupForm({ courseId, courseSlug, group, teachers = [], branches, canManageMoney }: GroupFormProps) {
  const t = useTranslations("groups");
  const tWeekdays = useTranslations("weekdays");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tValidation = useTranslations("validation");
  const tDatePicker = useTranslations("datePicker");
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!group;

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: group?.name || "",
      branchId: group?.branchId || branches[0]?.id || "",
      description: group?.description || "",
      schedule: group?.schedule || "",
      teacherId: group?.teacherId || "",
      scheduleDays: group?.scheduleDays ?? [],
      startDate: toDateInput(group?.startDate),
      endDate: toDateInput(group?.endDate),
      price: group?.price ?? "",
      salaryPercentBp: group?.salaryPercentBp ?? "",
    },
  });

  const onSubmit = (data: CreateGroupInput) => {
    // Цена группы обязательна: по ней одной начисляется оплата (цена курса
    // в начислениях не участвует). Схема пропускает "" как начальное
    // значение поля, поэтому пустое ловим здесь
    if (data.price === "" || data.price === undefined) {
      setError("price", { type: "required" });
      return;
    }
    const payload = canManageMoney ? data : { ...data, salaryPercentBp: undefined };
    startTransition(async () => {
      const result = isEdit
        ? await updateGroup(group.id, payload)
        : await createGroup(courseId, payload);

      if (!result.success) {
        toast({
          title: tErrors("error"),
          description: tErrors.has(result.error) ? tErrors(result.error as never) : result.error,
          variant: "destructive",
        });
        return;
      }

      toast({ title: isEdit ? t("groupUpdated") : t("groupCreated") });
      router.push(`/courses/${courseSlug}/groups`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="name">{t("groupName")}</Label>
        <Input id="name" {...register("name")} placeholder={t("groupNamePlaceholder")} />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="branchId">{t("branch")}</Label>
        <select
          id="branchId"
          {...register("branchId")}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {branches.length === 0 && <option value="">{t("selectBranchPlaceholder")}</option>}
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        {errors.branchId && (
          <p className="text-sm text-destructive">{tValidation.has(errors.branchId.message ?? "") ? tValidation(errors.branchId.message as never) : errors.branchId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder={t("descriptionPlaceholder")}
          rows={3}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      {teachers.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="teacherId">{t("teacher")}</Label>
          {/* Обычный select, а не Radix: значение "" осмысленное — «взять
              преподавателя курса», а SelectItem пустую строку не принимает */}
          <select
            id="teacherId"
            {...register("teacherId")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{t("teacherFromCourse")}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.lastName} {teacher.firstName}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t("teacherHint")}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="schedule">{t("schedule")}</Label>
        <Input
          id="schedule"
          {...register("schedule")}
          placeholder={t("schedulePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("scheduleDays")}</Label>
        <Controller
          name="scheduleDays"
          control={control}
          render={({ field }) => {
            const selected = field.value ?? [];
            return (
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => {
                  const isOn = selected.includes(day.iso);
                  return (
                    <Button
                      key={day.iso}
                      type="button"
                      variant={isOn ? "default" : "outline"}
                      size="sm"
                      aria-pressed={isOn}
                      className="w-14"
                      onClick={() =>
                        field.onChange(
                          isOn
                            ? selected.filter((iso) => iso !== day.iso)
                            : [...selected, day.iso].sort((a, b) => a - b)
                        )
                      }
                    >
                      {tWeekdays(day.key)}
                    </Button>
                  );
                })}
              </div>
            );
          }}
        />
        <p className="text-sm text-muted-foreground">{t("scheduleDaysHint")}</p>
        {errors.scheduleDays && (
          <p className="text-sm text-destructive">{t("scheduleDaysRequired")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">{t("price")}</Label>
        <Input
          id="price"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          {...register("price")}
          placeholder={t("pricePlaceholder")}
        />
        {errors.price && (
          <p className="text-sm text-destructive">{t("pricePositive")}</p>
        )}
        <p className="text-sm text-muted-foreground">{t("priceHint")}</p>
      </div>

      {canManageMoney && (
      <div className="space-y-2">
        <Label htmlFor="salaryPercentBp">{t("salaryPercent")}</Label>
        {/* Поле хранит базисные пункты (validators/group.ts), но вводится и
            показывается процентом с одним знаком после запятой (план
            зарплат, 5.2) — конвертация только здесь, на границе формы */}
        <Controller
          name="salaryPercentBp"
          control={control}
          render={({ field }) => (
            <Input
              id="salaryPercentBp"
              type="number"
              step={0.1}
              min={0}
              max={100}
              inputMode="decimal"
              value={
                field.value === "" || field.value === undefined || field.value === null
                  ? ""
                  : String(Number(field.value) / 100)
              }
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  field.onChange("");
                  return;
                }
                const percent = Number(raw);
                if (Number.isNaN(percent)) return;
                field.onChange(Math.round(percent * 100));
              }}
              placeholder={t("salaryPercentPlaceholder")}
            />
          )}
        />
        {errors.salaryPercentBp && (
          <p className="text-sm text-destructive">{t("salaryPercentInvalid")}</p>
        )}
        <p className="text-sm text-muted-foreground">{t("salaryPercentHint")}</p>
      </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("startDate")}</Label>
          <Controller
            name="startDate"
            control={control}
            render={({ field }) => (
              <DatePicker
                value={fromDateInput(field.value)}
                // Строкой, а не Date: см. комментарий в src/validators/group.ts
                onChange={(date) =>
                  field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                }
                placeholder={tDatePicker("selectDate")}
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("endDate")}</Label>
          <Controller
            name="endDate"
            control={control}
            render={({ field }) => (
              <DatePicker
                value={fromDateInput(field.value)}
                onChange={(date) =>
                  field.onChange(date ? format(date, "yyyy-MM-dd") : "")
                }
                placeholder={tDatePicker("selectDate")}
              />
            )}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon("saving") : isEdit ? tCommon("save") : t("createGroup")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/courses/${courseSlug}/groups`)}
        >
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
