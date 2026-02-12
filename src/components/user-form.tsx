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
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
}

interface UserFormProps {
  user?: UserData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<{ success: boolean; error?: string; [key: string]: any }>;
}

export function UserForm({ user, onSubmit }: UserFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("users");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!user;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = (isEditing ? updateUserSchema : createUserSchema) as any;
  const form = useForm<CreateUserInput | UpdateUserInput>({
    resolver: zodResolver(schema),
    defaultValues: isEditing
      ? {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? "",
          role: user.role,
        }
      : {
          email: "",
          password: "",
          firstName: "",
          lastName: "",
          phone: "",
          role: "STUDENT" as const,
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
          description: result.error ?? t("saveFailed"),
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
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                  {form.formState.errors.firstName.message}
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
                  {form.formState.errors.lastName.message}
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
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("passwordPlaceholder")}
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
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
                {form.formState.errors.phone.message}
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
                {form.formState.errors.role.message}
              </p>
            )}
          </div>

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
