"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createGroupSchema, type CreateGroupInput } from "@/validators/group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "@/i18n/navigation";
import { useTransition } from "react";
import { createGroup, updateGroup } from "@/actions/group-actions";
import { useTranslations } from "next-intl";

interface GroupFormProps {
  courseId: string;
  courseSlug: string;
  group?: {
    id: string;
    name: string;
    description: string | null;
    schedule: string | null;
    startDate: Date | null;
    endDate: Date | null;
  };
}

export function GroupForm({ courseId, courseSlug, group }: GroupFormProps) {
  const t = useTranslations("groups");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tDatePicker = useTranslations("datePicker");
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!group;

  const {
    register,
    handleSubmit,
    control,
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
        toast({ title: tErrors("error"), description: result.error, variant: "destructive" });
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

      <div className="space-y-2">
        <Label htmlFor="schedule">{t("schedule")}</Label>
        <Input
          id="schedule"
          {...register("schedule")}
          placeholder={t("schedulePlaceholder")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("startDate")}</Label>
          <Controller
            name="startDate"
            control={control}
            render={({ field }) => (
              <DatePicker
                value={field.value ? new Date(field.value) : undefined}
                onChange={(date) => field.onChange(date)}
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
                value={field.value ? new Date(field.value) : undefined}
                onChange={(date) => field.onChange(date)}
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
