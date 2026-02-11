"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGroupSchema, type CreateGroupInput } from "@/validators/group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createGroup, updateGroup } from "@/actions/group-actions";

interface GroupFormProps {
  courseId: string;
  group?: {
    id: string;
    name: string;
    description: string | null;
    schedule: string | null;
    startDate: Date | null;
    endDate: Date | null;
  };
}

export function GroupForm({ courseId, group }: GroupFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!group;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateGroupInput>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: group?.name || "",
      description: group?.description || "",
      schedule: group?.schedule || "",
      startDate: group?.startDate || undefined,
      endDate: group?.endDate || undefined,
    },
  });

  const onSubmit = (data: CreateGroupInput) => {
    startTransition(async () => {
      const result = isEdit
        ? await updateGroup(group.id, data)
        : await createGroup(courseId, data);

      if (!result.success) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: isEdit ? "Группа обновлена" : "Группа создана" });
      router.push(`/courses/${courseId}/groups`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="name">Название группы *</Label>
        <Input id="name" {...register("name")} placeholder="Например: Утренняя группа" />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Описание</Label>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Краткое описание группы"
          rows={3}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule">Расписание</Label>
        <Input
          id="schedule"
          {...register("schedule")}
          placeholder="Например: Пн, Ср, Пт 09:00-11:00"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startDate">Дата начала</Label>
          <Input id="startDate" type="date" {...register("startDate")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Дата окончания</Label>
          <Input id="endDate" type="date" {...register("endDate")} />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохранение..." : isEdit ? "Сохранить" : "Создать группу"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/courses/${courseId}/groups`)}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
