"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Youtube } from "lucide-react";

type VideoSource = "YOUTUBE" | "UPLOAD";

const formSchema = z.object({
  title: z.string().min(1, "Название обязательно"),
  content: z.string().min(1, "Конспект урока обязателен"),
  hasVideo: z.boolean(),
  videoUrl: z.string().optional(),
  videoSource: z.enum(["YOUTUBE", "UPLOAD"]).optional(),
  sortOrder: z.coerce.number().int().min(0, "Порядок не может быть отрицательным"),
  isPublished: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

export interface LessonFormSubmitData {
  title: string;
  content: string;
  videoUrl?: string;
  videoSource?: VideoSource;
  sortOrder: number;
  isPublished: boolean;
}

interface LessonFormProps {
  lesson?: {
    id: string;
    title: string;
    content?: string | null;
    videoUrl?: string | null;
    videoSource?: VideoSource | null;
    sortOrder: number;
    isPublished: boolean;
  };
  courseId: string;
  onSubmit: (data: LessonFormSubmitData) => Promise<{ success: boolean; error?: string }>;
}

export function LessonForm({ lesson, courseId, onSubmit }: LessonFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(
    lesson?.videoSource === "UPLOAD" ? lesson?.videoUrl ?? null : null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasExistingVideo = !!(lesson?.videoUrl);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: lesson?.title ?? "",
      content: lesson?.content ?? "",
      hasVideo: hasExistingVideo,
      videoUrl: lesson?.videoUrl ?? "",
      videoSource: lesson?.videoSource ?? "YOUTUBE",
      sortOrder: lesson?.sortOrder ?? 0,
      isPublished: lesson?.isPublished ?? false,
    },
  });

  const hasVideo = watch("hasVideo");
  const videoSource = watch("videoSource");
  const isPublished = watch("isPublished");

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 500 МБ",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<string>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            resolve(response.url);
          } else {
            reject(new Error("Ошибка загрузки"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Ошибка сети")));
        xhr.open("POST", "/api/v1/upload/video");
        xhr.send(formData);
      });

      const url = await uploadPromise;
      setUploadedVideoUrl(url);
      setValue("videoUrl", url);
      toast({
        title: "Успешно",
        description: "Видео загружено",
      });
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить видео",
        variant: "destructive",
      });
    } finally {
      setUploadProgress(null);
    }
  }

  async function onFormSubmit(data: FormData) {
    setIsSubmitting(true);
    try {
      const submitData: LessonFormSubmitData = {
        title: data.title,
        content: data.content,
        sortOrder: data.sortOrder,
        isPublished: data.isPublished,
      };

      if (data.hasVideo && data.videoUrl) {
        submitData.videoUrl = data.videoUrl;
        submitData.videoSource = data.videoSource;
      }

      const result = await onSubmit(submitData);
      if (result.success) {
        toast({
          title: "Успешно",
          description: lesson ? "Урок обновлен" : "Урок создан",
        });
        router.push(`/courses/${courseId}/lessons`);
        router.refresh();
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Что-то пошло не так",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Ошибка",
        description: "Что-то пошло не так",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6 max-w-2xl">
      {/* Название */}
      <div className="space-y-2">
        <Label htmlFor="title">Название урока</Label>
        <Input
          id="title"
          placeholder="Введите название урока"
          {...register("title")}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      {/* Видео (опционально) */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="hasVideo"
            checked={hasVideo}
            onCheckedChange={(checked: boolean) => {
              setValue("hasVideo", checked);
              if (!checked) {
                setValue("videoUrl", "");
                setValue("videoSource", "YOUTUBE");
              }
            }}
          />
          <Label htmlFor="hasVideo" className="cursor-pointer">
            Добавить видео
          </Label>
        </div>

        {hasVideo && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="space-y-2">
              <Label>Источник видео</Label>
              <RadioGroup
                value={videoSource}
                onValueChange={(value: string) =>
                  setValue("videoSource", value as VideoSource)
                }
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="YOUTUBE" id="source-youtube" />
                  <Label htmlFor="source-youtube" className="cursor-pointer flex items-center gap-1">
                    <Youtube className="h-4 w-4" />
                    YouTube
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="UPLOAD" id="source-upload" />
                  <Label htmlFor="source-upload" className="cursor-pointer flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    Загрузка файла
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {videoSource === "YOUTUBE" && (
              <div className="space-y-2">
                <Label htmlFor="videoUrl">Ссылка на YouTube</Label>
                <Input
                  id="videoUrl"
                  placeholder="https://www.youtube.com/watch?v=..."
                  {...register("videoUrl")}
                />
                {errors.videoUrl && (
                  <p className="text-sm text-destructive">
                    {errors.videoUrl.message}
                  </p>
                )}
              </div>
            )}

            {videoSource === "UPLOAD" && (
              <div className="space-y-2">
                <Label>Загрузить видео</Label>
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadProgress !== null}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadProgress !== null
                      ? `Загрузка... ${uploadProgress}%`
                      : "Выбрать файл"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoUpload}
                  />
                </div>
                {uploadProgress !== null && (
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
                {uploadedVideoUrl && (
                  <p className="text-sm text-muted-foreground">
                    Видео загружено: {uploadedVideoUrl}
                  </p>
                )}
                {errors.videoUrl && (
                  <p className="text-sm text-destructive">
                    {errors.videoUrl.message}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Конспект урока (обязательно) */}
      <div className="space-y-2">
        <Label htmlFor="content">Конспект урока</Label>
        <Textarea
          id="content"
          placeholder="Введите текст конспекта..."
          rows={15}
          {...register("content")}
        />
        {errors.content && (
          <p className="text-sm text-destructive">{errors.content.message}</p>
        )}
      </div>

      {/* Порядок сортировки */}
      <div className="space-y-2">
        <Label htmlFor="sortOrder">Порядок сортировки</Label>
        <Input
          id="sortOrder"
          type="number"
          min={0}
          {...register("sortOrder", { valueAsNumber: true })}
        />
        {errors.sortOrder && (
          <p className="text-sm text-destructive">
            {errors.sortOrder.message}
          </p>
        )}
      </div>

      {/* Опубликован */}
      <div className="flex items-center space-x-2">
        <Switch
          id="isPublished"
          checked={isPublished}
          onCheckedChange={(checked: boolean) => setValue("isPublished", checked)}
        />
        <Label htmlFor="isPublished" className="cursor-pointer">
          Опубликовать
        </Label>
      </div>

      {/* Кнопки */}
      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Сохранение..."
            : lesson
              ? "Сохранить изменения"
              : "Создать урок"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/courses/${courseId}/lessons`)}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
