"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
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
import { Loader2 } from "lucide-react";

interface UserData {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  branchId?: string | null;
}

interface UserFormProps {
  user?: UserData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<{ success: boolean; error?: string; [key: string]: any }>;
  /** Филиал — приписка справочная, поле необязательно (см. validators/user.ts) */
  branches?: { id: string; name: string }[];
}

export function UserForm({ user, onSubmit, branches = [] }: UserFormProps) {
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
          email: user.email ?? "",
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? "",
          role: user.role,
          branchId: user.branchId ?? "",
        }
      : {
          email: "",
          password: "",
          firstName: "",
          lastName: "",
          phone: "",
          role: "STUDENT" as const,
          branchId: "",
        },
  });

  const [isActive, setIsActive] = useState(user?.isActive ?? true);

  const handleSubmit = async (data: CreateUserInput | UpdateUserInput) => {
    setIsLoading(true);
    try {
      const submitData = isEditing
        ? { ...data, id: user!.id, isActive }
        : data;
      const result = await onSubmit(submitData);
      if (result.success) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing ? t("editUser") : t("newUser")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* autoComplete="off": иначе Chrome принимает пару email+пароль за
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
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              autoComplete="off"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">
                {fieldError(form.formState.errors.email.message)}
              </p>
            )}
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              {/* new-password — единственное значение, которое Chrome
                  действительно уважает: сохранённый пароль он не подставит */}
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder={t("passwordPlaceholder")}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {fieldError(form.formState.errors.password.message)}
                </p>
              )}
            </div>
          )}

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
          </div>

          <div className="space-y-2">
            <Label>{t("role")}</Label>
            <Select
              defaultValue={form.getValues("role") ?? "STUDENT"}
              onValueChange={(value) => {
                form.setValue("role", value as "ADMIN" | "TEACHER" | "STUDENT");
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

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="branchId">{t("branch")}</Label>
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
            </div>
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
