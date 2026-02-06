"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import type { User } from "@/generated/prisma";
import { Loader2 } from "lucide-react";

interface UserFormProps {
  user?: User;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<{ success: boolean; error?: string }>;
}

export function UserForm({ user, onSubmit }: UserFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!user;

  const form = useForm<CreateUserInput | UpdateUserInput>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
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
          title: isEditing ? "Пользователь обновлен" : "Пользователь создан",
          description: isEditing
            ? "Данные пользователя успешно обновлены."
            : "Новый пользователь успешно создан.",
        });
        router.push("/users");
        router.refresh();
      } else {
        toast({
          title: "Ошибка",
          description: result.error ?? "Произошла ошибка при сохранении.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Произошла непредвиденная ошибка.",
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
          {isEditing ? "Редактирование пользователя" : "Новый пользователь"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">Имя</Label>
              <Input
                id="firstName"
                placeholder="Введите имя"
                {...form.register("firstName")}
              />
              {form.formState.errors.firstName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Фамилия</Label>
              <Input
                id="lastName"
                placeholder="Введите фамилию"
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
            <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="Минимум 6 символов"
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
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              placeholder="+7 (XXX) XXX-XX-XX"
              {...form.register("phone")}
            />
            {form.formState.errors.phone && (
              <p className="text-sm text-destructive">
                {form.formState.errors.phone.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Роль</Label>
            <Select
              defaultValue={form.getValues("role") ?? "STUDENT"}
              onValueChange={(value) => {
                form.setValue("role", value as "ADMIN" | "TEACHER" | "STUDENT");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите роль" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Администратор</SelectItem>
                <SelectItem value="TEACHER">Преподаватель</SelectItem>
                <SelectItem value="STUDENT">Студент</SelectItem>
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
              <Label htmlFor="isActive">Активен</Label>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Сохранить изменения" : "Создать пользователя"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/users")}
            >
              Отмена
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
