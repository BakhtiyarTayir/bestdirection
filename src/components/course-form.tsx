"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { createCourseSchema, type CreateCourseInput } from "@/validators/course";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { createCourse, updateCourse } from "@/actions/course-actions";
import { Loader2, Upload, X, ImageIcon } from "lucide-react";

const courseFormSchema = createCourseSchema;

type CourseFormValues = CreateCourseInput;

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface CourseData {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  teacherId: string;
  isPublished: boolean;
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
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
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
    formState: { errors },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      title: course?.title || "",
      description: course?.description || "",
      teacherId: isAdmin ? (course?.teacherId || "") : currentUserId,
      isPublished: course?.isPublished || false,
    },
  });

  const selectedTeacherId = watch("teacherId");
  const isPublished = watch("isPublished");

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/v1/upload/image", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Ошибка загрузки",
          description: data.error || "Не удалось загрузить изображение",
          variant: "destructive",
        });
        return;
      }

      setCoverImage(data.url);
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить изображение",
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
          });
          if (result.success) {
            toast({ title: "Курс обновлен" });
            router.push(`/courses/${course.id}`);
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error,
              variant: "destructive",
            });
          }
        } else {
          const result = await createCourse({
            title: data.title,
            description: data.description,
            coverImage: coverImage || undefined,
            teacherId: data.teacherId,
          });
          if (result.success) {
            toast({ title: "Курс создан" });
            router.push("/courses");
            router.refresh();
          } else {
            toast({
              title: "Ошибка",
              description: result.error,
              variant: "destructive",
            });
          }
        }
      } catch {
        toast({
          title: "Ошибка",
          description: "Что-то пошло не так",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing ? "Редактирование курса" : "Новый курс"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Название</Label>
            <Input
              id="title"
              placeholder="Введите название курса"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              placeholder="Введите описание курса"
              rows={5}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Cover Image */}
          <div className="space-y-2">
            <Label>Обложка курса</Label>
            {coverImage ? (
              <div className="relative aspect-video w-full max-w-md rounded-lg overflow-hidden border">
                <Image
                  src={coverImage}
                  alt="Обложка курса"
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
                  Нажмите для загрузки изображения
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  JPG, PNG или WebP, до 5 МБ
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
                Заменить обложку
              </Button>
            )}
            {uploading && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загрузка...
              </p>
            )}
          </div>

          {isAdmin && (
            <div className="space-y-2">
              <Label>Преподаватель</Label>
              <Select
                value={selectedTeacherId}
                onValueChange={(value) => setValue("teacherId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите преподавателя" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.firstName} {teacher.lastName} ({teacher.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.teacherId && (
                <p className="text-sm text-destructive">
                  {errors.teacherId.message}
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
              <Label htmlFor="isPublished">Опубликован</Label>
            </div>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={isPending || uploading}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Сохранить" : "Создать"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Отмена
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
