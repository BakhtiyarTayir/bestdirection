"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { createUserSchema, updateUserSchema } from "@/validators/user";
import type { CreateUserInput, UpdateUserInput } from "@/validators/user";
import type { Role } from "@/validators/user";
import { checkLoginAvailable, suggestLogin } from "@/lib/api/users";
import type { ApiUsersFormOptions } from "@/lib/api/users";
import { Loader2, Wand2, Copy, Check } from "lucide-react";

interface UserData {
  id: string;
  login?: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  branchId?: string | null;
  salaryPercentBp?: number | null;
}

interface UserFormProps {
  user?: UserData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<{ success: boolean; error?: string; [key: string]: any }>;
  /** Филиал — приписка справочная, поле необязательно (см. validators/user.ts) */
  branches?: { id: string; name: string }[];
  /** Курсы и группы для блока «Обучение» — есть только на создании (4.4) */
  formOptions?: ApiUsersFormOptions;
}

/** Читаемый случайный пароль: без похожих друг на друга символов (0/O, 1/l). */
function generateRandomPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

export function UserForm({ user, onSubmit, branches = [], formOptions }: UserFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("users");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tValidation = useTranslations("validation");
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!user;

  // Схема валидации общая с серверными действиями, поэтому в сообщениях лежат
  // ключи, а не текст. Незнакомое сообщение (например, собственное от Zod)
  // отдаём как есть.
  const fieldError = (message?: string) =>
    message && tValidation.has(message) ? tValidation(message) : message;

  // Действия возвращают коды ошибок; те, что есть в namespace errors,
  // переводим, остальные показываем без перевода, чтобы не терять смысл.
  const actionError = (code?: string) =>
    code && tErrors.has(code) ? tErrors(code) : code || t("saveFailed");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = (isEditing ? updateUserSchema : createUserSchema) as any;
  const form = useForm<CreateUserInput | UpdateUserInput>({
    resolver: zodResolver(schema),
    defaultValues: isEditing
      ? {
          id: user.id,
          login: user.login ?? "",
          password: "",
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? "",
          role: user.role,
          branchId: user.branchId ?? "",
          salaryPercentBp: user.salaryPercentBp ?? null,
        }
      : {
          login: "",
          password: "",
          firstName: "",
          lastName: "",
          phone: "",
          role: "STUDENT" as const,
          branchId: "",
        },
  });

  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const role = form.watch("role");

  // ─── Логин: автоподстановка из имени+фамилии, кнопка «Сгенерировать»,
  // проверка занятости живьём ────────────────────────────────────────────
  const [loginTouched, setLoginTouched] = useState(isEditing);
  const [loginStatus, setLoginStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const firstName = form.watch("firstName");
  const lastName = form.watch("lastName");
  const loginValue = form.watch("login") as string | undefined;
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isEditing || loginTouched) return;
    if (!firstName?.trim() || !lastName?.trim()) return;
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      const result = await suggestLogin({ firstName, lastName });
      if (result.success) {
        form.setValue("login", result.data.login, { shouldValidate: false });
      }
    }, 400);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstName, lastName, isEditing, loginTouched]);

  useEffect(() => {
    const login = loginValue?.trim().toLowerCase();
    if (!login || login.length < 3) {
      setLoginStatus("idle");
      return;
    }
    // Свой прежний логин не считается занятым — иначе форма правки его же
    // отчитывала бы как таковой
    if (isEditing && login === (user?.login ?? "").toLowerCase()) {
      setLoginStatus("idle");
      return;
    }
    setLoginStatus("checking");
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(async () => {
      const result = await checkLoginAvailable(login);
      if (result.success) setLoginStatus(result.data.available ? "available" : "taken");
    }, 400);
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginValue, isEditing]);

  const regenerateLogin = async () => {
    if (!firstName?.trim() || !lastName?.trim()) return;
    const result = await suggestLogin({ firstName, lastName });
    if (result.success) {
      form.setValue("login", result.data.login, { shouldValidate: true });
      setLoginTouched(false);
    }
  };

  // ─── Пароль: кнопка «Сгенерировать» + однократный показ после сохранения ──
  const generatePassword = () => {
    const generated = generateRandomPassword();
    form.setValue("password", generated, { shouldValidate: true });
  };

  const [revealPassword, setRevealPassword] = useState<{ login: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // ─── Блок «Обучение» (только создание ученика, 4.4) ──────────────────────
  const [enrollmentEnabled, setEnrollmentEnabled] = useState(false);
  const branchId = form.watch("branchId") as string | undefined;
  const enrollmentCourseId = (form.watch as (name: string) => unknown)("enrollment.courseId") as string | undefined;
  const groupsForCourse = useMemo(() => {
    if (!formOptions || !enrollmentCourseId) return [];
    return formOptions.groups.filter(
      (group) => group.courseId === enrollmentCourseId && (!branchId || group.branchId === branchId)
    );
  }, [formOptions, enrollmentCourseId, branchId]);

  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    setIsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = isEditing ? { ...data, id: user!.id, isActive } : { ...data };
      if (!isEditing && (!enrollmentEnabled || role !== "STUDENT")) {
        delete payload.enrollment;
      }
      // Пустой пароль в форме правки значит «не менять» — пустую строку
      // серверу не отправляем вовсе, а не как «слишком короткий пароль»
      if (isEditing && !payload.password) {
        delete payload.password;
      }

      const result = await onSubmit(payload);
      if (result.success) {
        const usedPassword: string | undefined = payload.password || undefined;
        if (usedPassword) {
          // Пароль виден только сейчас — в базе лежит только его хэш
          setRevealPassword({ login: (payload.login as string) || user?.login || "", password: usedPassword });
          setIsLoading(false);
          return;
        }
        toast({
          title: isEditing ? t("userUpdated") : t("userCreated"),
          description: isEditing
            ? t("userUpdatedDescription")
            : t("userCreatedDescription"),
        });
        router.push("/users");
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: actionError(result.error),
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
      setIsLoading(false);
    }
  };

  const copyPassword = async () => {
    if (!revealPassword) return;
    await navigator.clipboard.writeText(revealPassword.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const continueAfterReveal = () => {
    toast({
      title: isEditing ? t("userUpdated") : t("userCreated"),
      description: isEditing ? t("userUpdatedDescription") : t("userCreatedDescription"),
    });
    router.push("/users");
    router.refresh();
  };

  if (revealPassword) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("generatedPasswordTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("generatedPasswordDescription")}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {revealPassword.login} / {revealPassword.password}
            </div>
            <Button type="button" variant="outline" onClick={copyPassword}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copyPassword")}
            </Button>
          </div>
          <Button type="button" onClick={continueAfterReveal}>
            {tCommon("saveChanges")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing ? t("editUser") : t("newUser")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* autoComplete="off": иначе Chrome принимает пару логин+пароль за
            форму входа и подставляет сюда сохранённые данные администратора */}
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="space-y-4"
          autoComplete="off"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input
                id="firstName"
                placeholder={t("firstNamePlaceholder")}
                {...form.register("firstName")}
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-destructive">
                  {fieldError(form.formState.errors.firstName.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input
                id="lastName"
                placeholder={t("lastNamePlaceholder")}
                {...form.register("lastName")}
              />
              {form.formState.errors.lastName && (
                <p className="text-sm text-destructive">
                  {fieldError(form.formState.errors.lastName.message)}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="login">{t("login")}</Label>
            <div className="flex gap-2">
              <Input
                id="login"
                placeholder={t("loginPlaceholder")}
                autoComplete="off"
                {...form.register("login", {
                  onChange: () => setLoginTouched(true),
                })}
              />
              <Button type="button" variant="outline" onClick={regenerateLogin}>
                <Wand2 className="mr-1 h-4 w-4" />
                {t("generateLogin")}
              </Button>
            </div>
            {loginStatus === "checking" && (
              <p className="text-sm text-muted-foreground">{t("checkingLogin")}</p>
            )}
            {loginStatus === "available" && (
              <p className="text-sm text-green-600">{t("loginAvailable")}</p>
            )}
            {loginStatus === "taken" && (
              <p className="text-sm text-destructive">{t("loginTaken")}</p>
            )}
            {(form.formState.errors as Record<string, { message?: string }>).login && (
              <p className="text-sm text-destructive">
                {fieldError((form.formState.errors as Record<string, { message?: string }>).login?.message)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{isEditing ? t("newPasswordOptional") : t("password")}</Label>
            <div className="flex gap-2">
              {/* new-password — единственное значение, которое Chrome
                  действительно уважает: сохранённый пароль он не подставит */}
              <Input
                id="password"
                type="text"
                autoComplete="new-password"
                placeholder={isEditing ? t("newPasswordOptionalNote") : t("passwordPlaceholder")}
                {...form.register("password")}
              />
              <Button type="button" variant="outline" onClick={generatePassword}>
                <Wand2 className="mr-1 h-4 w-4" />
                {t("generatePassword")}
              </Button>
            </div>
            {isEditing && <p className="text-sm text-muted-foreground">{t("newPasswordOptionalNote")}</p>}
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">
                {fieldError(form.formState.errors.password.message)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t("phone")}</Label>
            <Input
              id="phone"
              placeholder={t("phonePlaceholder")}
              {...form.register("phone")}
            />
            {form.formState.errors.phone && (
              <p className="text-sm text-destructive">
                {fieldError(form.formState.errors.phone.message)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">{t("phoneNote")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("role")}</Label>
            <Select
              defaultValue={form.getValues("role") ?? "STUDENT"}
              onValueChange={(value) => {
                form.setValue("role", value as "ADMIN" | "TEACHER" | "STUDENT");
                if (value !== "STUDENT") setEnrollmentEnabled(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectRole")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">{tRoles("ADMIN")}</SelectItem>
                <SelectItem value="TEACHER">{tRoles("TEACHER")}</SelectItem>
                <SelectItem value="STUDENT">{tRoles("STUDENT")}</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.role && (
              <p className="text-sm text-destructive">
                {fieldError(form.formState.errors.role.message)}
              </p>
            )}
          </div>

          {/* Ставка зарплаты — только при правке преподавателя. На создании
              роль ещё можно передумать, и заводить ставку раньше, чем
              появится карточка преподавателя, незачем. */}
          {isEditing && role === "TEACHER" && (
            <div className="space-y-2">
              <Label htmlFor="salaryPercentBp">{t("salaryPercent")}</Label>
              {/* Поле хранит базисные пункты (validators/user.ts), вводится
                  процентом с одним знаком после запятой — как у группы
                  (group-form.tsx), план зарплат 5.2 */}
              <Controller
                name="salaryPercentBp"
                control={form.control}
                render={({ field }) => (
                  <Input
                    id="salaryPercentBp"
                    type="number"
                    step={0.1}
                    min={0}
                    max={100}
                    inputMode="decimal"
                    value={
                      field.value === null || field.value === undefined ? "" : String(Number(field.value) / 100)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        field.onChange(null);
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
              <p className="text-sm text-muted-foreground">{t("salaryPercentHint")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="branchId">
              {t("branch")}
              {!isEditing && " *"}
            </Label>
            {/* Обычный select: "" осмысленно ("не выбран"), а SelectItem
                пустую строку не принимает (как в group-form.tsx) */}
            <select
              id="branchId"
              {...form.register("branchId")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{t("selectBranchPlaceholder")}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {!isEditing && (
              <p className="text-sm text-muted-foreground">{t("branchRequiredHint")}</p>
            )}
            {(form.formState.errors as Record<string, { message?: string }>).branchId && (
              <p className="text-sm text-destructive">
                {fieldError((form.formState.errors as Record<string, { message?: string }>).branchId?.message)}
              </p>
            )}
          </div>

          {/* Блок «Обучение» — только при создании ученика (4.4). Условия
              обучения у УЖЕ существующего ученика правятся на карточке
              биллинга, а не здесь (ловушка 4.7.5: два места правки — верный
              способ развести две разные правды) */}
          {!isEditing && role === "STUDENT" && formOptions && (
            <Card className="border-dashed">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{t("enrollmentTitle")}</CardTitle>
                <Switch checked={enrollmentEnabled} onCheckedChange={setEnrollmentEnabled} />
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("enrollmentHint")}</p>
                {enrollmentEnabled && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="enrollment.courseId">{t("enrollmentCourse")}</Label>
                      <select
                        id="enrollment.courseId"
                        {...(form.register as (name: string) => Record<string, unknown>)("enrollment.courseId")}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("selectCoursePlaceholder")}</option>
                        {formOptions.courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="enrollment.groupId">{t("enrollmentGroup")}</Label>
                      <select
                        id="enrollment.groupId"
                        {...(form.register as (name: string) => Record<string, unknown>)("enrollment.groupId")}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        disabled={!enrollmentCourseId}
                      >
                        <option value="">{t("enrollmentNoGroup")}</option>
                        {groupsForCourse.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="enrollment.priceOverride">{t("enrollmentPrice")}</Label>
                        <Input
                          id="enrollment.priceOverride"
                          type="number"
                          placeholder={t("enrollmentPricePlaceholder")}
                          {...(form.register as (name: string) => Record<string, unknown>)("enrollment.priceOverride")}
                        />
                        <p className="text-sm text-muted-foreground">{t("enrollmentPriceNote")}</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="enrollment.startsAt">{t("enrollmentStartsAt")}</Label>
                        <Input
                          id="enrollment.startsAt"
                          type="date"
                          {...(form.register as (name: string) => Record<string, unknown>)("enrollment.startsAt")}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="enrollment.firstMonthCharge">{t("enrollmentFirstMonthCharge")}</Label>
                      <Input
                        id="enrollment.firstMonthCharge"
                        type="number"
                        placeholder={t("enrollmentFirstMonthChargePlaceholder")}
                        {...(form.register as (name: string) => Record<string, unknown>)("enrollment.firstMonthCharge")}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {isEditing && (
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="isActive">{tCommon("active")}</Label>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? tCommon("saveChanges") : t("createUser")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/users")}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
