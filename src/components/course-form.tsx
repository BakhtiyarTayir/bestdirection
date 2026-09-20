"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@/i18n/navigation";
import { toDateInput } from "@/lib/date-only";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { createCourseSchema, type CreateCourseInput } from "@/validators/course";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { createCourse, updateCourse } from "@/lib/api/courses";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { uploadImage } from "@/lib/api/uploads";

const courseFormSchema = createCourseSchema;

type CourseFormValues = CreateCourseInput;

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  login: string | null;
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  teacherId: string;
  isPublished: boolean;
  accessType?: "CLOSED" | "FREE" | "PAID";
  isPublicListed?: boolean;
  price?: number | null;
  publicSummaryRu?: string | null;
  publicSummaryUz?: string | null;
  // Из api дата приходит строкой ISO, из формы — объектом Date
  intakeStartDate?: Date | string | null;
  intakeSeats?: number | null;
  intakeNoteRu?: string | null;
  intakeNoteUz?: string | null;
}

interface CourseFormProps {
  course?: CourseData;
  teachers: Teacher[];
  currentUserId: string;
  currentUserRole: string;
}

export function CourseForm({
  course,
  teachers,
  currentUserId,
  currentUserRole,
}: CourseFormProps) {
  const t = useTranslations("courses");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tValidation = useTranslations("validation");
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // Схема валидации общая с серверными действиями, поэтому в сообщениях лежат
  // ключи, а не текст: переводим их здесь. Zod может подставить и собственное
  // сообщение (например, для нечислового значения) — такое отдаём как есть.
  const fieldError = (message?: string) =>
    message && tValidation.has(message) ? tValidation(message) : message;

  // Серверные действия возвращают коды ошибок. Часть из них есть в namespace
  // errors, остальные — англоязычные строки из старых действий, их показываем
  // без перевода, чтобы не терять смысл.
  const actionError = (code?: string) =>
    code && tErrors.has(code) ? tErrors(code) : code || tErrors("somethingWentWrong");

  const isEditing = !!course;
  const isAdmin = currentUserRole === "ADMIN";

  const [coverImage, setCoverImage] = useState<string | null>(course?.coverImage || null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      title: course?.title || "",
      description: course?.description || "",
      teacherId: isAdmin ? (course?.teacherId || "") : currentUserId,
      isPublished: course?.isPublished || false,
      accessType: course?.accessType || "CLOSED",
      isPublicListed: course?.isPublicListed || false,
      price: course?.price ?? undefined,
      publicSummaryRu: course?.publicSummaryRu || "",
      publicSummaryUz: course?.publicSummaryUz || "",
      intakeStartDate: course?.intakeStartDate ? new Date(course.intakeStartDate) : undefined,
      intakeSeats: course?.intakeSeats ?? undefined,
      intakeNoteRu: course?.intakeNoteRu || "",
      intakeNoteUz: course?.intakeNoteUz || "",
    },
  });

  const selectedTeacherId = watch("teacherId");
  const isPublished = watch("isPublished");
  const isPublicListed = watch("isPublicListed");
  const accessType = watch("accessType");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadImage(file);

      if (!result.success) {
        toast({
          title: t("uploadError"),
          description: result.error ? tErrors(result.error) : t("uploadFailed"),
          variant: "destructive",
        });
        return;
      }

      setCoverImage(result.data.url);
    } catch {
      toast({
        title: tErrors("error"),
        description: t("uploadFailed"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onSubmit = (data: CourseFormValues) => {
    startTransition(async () => {
      try {
        if (isEditing) {
          const result = await updateCourse(course.id, {
            title: data.title,
            description: data.description,
            coverImage: coverImage,
            isPublished: data.isPublished,
            accessType: data.accessType,
            isPublicListed: data.isPublicListed,
            price: data.price,
            publicSummaryRu: data.publicSummaryRu,
            publicSummaryUz: data.publicSummaryUz,
            // api ждёт календарную дату строкой: Date уехал бы на сутки
            intakeStartDate: toDateInput(data.intakeStartDate) || undefined,
            intakeSeats: data.intakeSeats,
            intakeNoteRu: data.intakeNoteRu,
            intakeNoteUz: data.intakeNoteUz,
          });
          if (result.success) {
            toast({ title: t("courseUpdated") });
            router.push(`/courses/${result.data.slug}`);
            router.refresh();
          } else {
            toast({
              title: tErrors("error"),
              description: actionError(result.error),
              variant: "destructive",
            });
          }
        } else {
          const result = await createCourse({
            title: data.title,
            description: data.description,
            coverImage: coverImage || undefined,
            teacherId: data.teacherId,
            accessType: data.accessType,
            price: data.price,
          });
          if (result.success) {
            toast({ title: t("courseCreated") });
            router.push(`/courses/${result.data.slug}`);
            router.refresh();
          } else {
            toast({
              title: tErrors("error"),
              description: actionError(result.error),
              variant: "destructive",
            });
          }
        }
      } catch {
        toast({
          title: tErrors("error"),
          description: tErrors("somethingWentWrong"),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing ? t("editCourse") : t("newCourse")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">{t("courseTitle")}</Label>
            <Input
              id="title"
              placeholder={t("courseTitlePlaceholder")}
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">
                {fieldError(errors.title.message)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("courseDescription")}</Label>
            <Textarea
              id="description"
              placeholder={t("courseDescriptionPlaceholder")}
              rows={5}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {fieldError(errors.description.message)}
              </p>
            )}
          </div>

          {/* Cover Image */}
          <div className="space-y-2">
            <Label>{t("coverImage")}</Label>
            {coverImage ? (
              <div className="relative aspect-video w-full max-w-md rounded-lg overflow-hidden border">
                <Image
                  src={coverImage}
                  alt={t("coverImageAlt")}
                  fill
                  className="object-cover"
                  sizes="(max-width: 448px) 100vw, 448px"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={() => setCoverImage(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center aspect-video w-full max-w-md rounded-lg border-2 border-dashed border-muted-foreground/25 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t("clickToUpload")}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  {t("imageFormat")}
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={handleImageUpload}
              disabled={uploading}
            />
            {coverImage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {t("replaceCover")}
              </Button>
            )}
            {uploading && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("uploading")}
              </p>
            )}
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label>{t("teacherLabel")}</Label>
              <Select
                value={selectedTeacherId}
                onValueChange={(value) => setValue("teacherId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectTeacher")} />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.firstName} {teacher.lastName} ({teacher.login})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.teacherId && (
                <p className="text-sm text-destructive">
                  {fieldError(errors.teacherId.message)}
                </p>
              )}
            </div>
          )}

          {isEditing && (
            <div className="flex items-center space-x-2">
              <Switch
                id="isPublished"
                checked={isPublished}
                onCheckedChange={(checked) => setValue("isPublished", checked)}
              />
              <Label htmlFor="isPublished">{tCommon("published")}</Label>
            </div>
          )}

          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">{t("accessTitle")}</h3>
            <div className="space-y-2">
              <Label>{t("accessTypeLabel")}</Label>
              <Controller
                name="accessType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CLOSED">{t("accessClosed")}</SelectItem>
                      <SelectItem value="FREE">{t("accessFree")}</SelectItem>
                      <SelectItem value="PAID">{t("accessPaid")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-sm text-muted-foreground">
                {accessType === "FREE"
                  ? t("accessFreeHint")
                  : accessType === "PAID"
                  ? t("accessPaidHint")
                  : t("accessClosedHint")}
              </p>
            </div>
            {accessType === "PAID" && (
              <div className="space-y-2">
                <Label htmlFor="price">{t("priceLabel")}</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  placeholder={t("pricePlaceholder")}
                  {...register("price")}
                />
              </div>
            )}
          </div>

          {isEditing && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium">{t("publicationTitle")}</h3>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isPublicListed"
                  checked={isPublicListed}
                  onCheckedChange={(checked) => setValue("isPublicListed", checked)}
                />
                <Label htmlFor="isPublicListed">{t("isPublicListedLabel")}</Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {accessType !== "PAID" && (
                <div className="space-y-2">
                  <Label htmlFor="price-marketing">{t("priceLabel")}</Label>
                  <Input
                    id="price-marketing"
                    type="number"
                    min={0}
                    placeholder={t("pricePlaceholder")}
                    {...register("price")}
                  />
                </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="intakeSeats">{t("intakeSeatsLabel")}</Label>
                  <Input
                    id="intakeSeats"
                    type="number"
                    min={0}
                    placeholder={t("intakeSeatsPlaceholder")}
                    {...register("intakeSeats")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("intakeStartDateLabel")}</Label>
                <Controller
                  name="intakeStartDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={(date) => field.onChange(date)}
                    />
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="publicSummaryRu">{t("publicSummaryRuLabel")}</Label>
                  <Textarea
                    id="publicSummaryRu"
                    rows={3}
                    placeholder={t("publicSummaryPlaceholder")}
                    {...register("publicSummaryRu")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publicSummaryUz">{t("publicSummaryUzLabel")}</Label>
                  <Textarea
                    id="publicSummaryUz"
                    rows={3}
                    placeholder={t("publicSummaryPlaceholder")}
                    {...register("publicSummaryUz")}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="intakeNoteRu">{t("intakeNoteRuLabel")}</Label>
                  <Input
                    id="intakeNoteRu"
                    placeholder={t("intakeNotePlaceholder")}
                    {...register("intakeNoteRu")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intakeNoteUz">{t("intakeNoteUzLabel")}</Label>
                  <Input
                    id="intakeNoteUz"
                    placeholder={t("intakeNotePlaceholder")}
                    {...register("intakeNoteUz")}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={isPending || uploading}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? tCommon("save") : tCommon("create")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
