"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@/i18n/navigation";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { VIDEO_UPLOAD_URL } from "@/lib/api/uploads";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MarkdownEditor } from "@/components/markdown-editor";
import { HtmlEditor } from "@/components/html-editor";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/use-toast";
import { Upload, Youtube, Code2, FileText } from "lucide-react";

type VideoSource = "YOUTUBE" | "UPLOAD";
type LessonContentFormat = "MARKDOWN" | "HTML";

function createFormSchema(tValidation: (key: string) => string) {
  return z.object({
    title: z.string().min(1, tValidation("titleRequired")),
    content: z.string().min(1, tValidation("lessonContentRequired")),
    contentFormat: z.enum(["MARKDOWN", "HTML"]),
    hasVideo: z.boolean(),
    videoUrl: z.string().optional(),
    videoSource: z.enum(["YOUTUBE", "UPLOAD"]).optional(),
    sortOrder: z.coerce.number().int().min(0, tValidation("sortOrderNonNegative")),
    isPublished: z.boolean(),
  });
}

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

export interface LessonFormSubmitData {
  title: string;
  content: string;
  contentFormat: LessonContentFormat;
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
    contentFormat?: LessonContentFormat | null;
    videoUrl?: string | null;
    videoSource?: VideoSource | null;
    sortOrder: number;
    isPublished: boolean;
  };
  courseSlug: string;
  onSubmit: (data: LessonFormSubmitData) => Promise<{ success: boolean; error?: string }>;
}

export function LessonForm({ lesson, courseSlug, onSubmit }: LessonFormProps) {
  const t = useTranslations("lessons");
  const tHtml = useTranslations("htmlLesson");
  const tCommon = useTranslations("common");
  const tSuccess = useTranslations("success");
  const tErrors = useTranslations("errors");
  const tValidation = useTranslations("validation");
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const formSchema = createFormSchema(tValidation);
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
      contentFormat: lesson?.contentFormat ?? "MARKDOWN",
      hasVideo: hasExistingVideo,
      videoUrl: lesson?.videoUrl ?? "",
      videoSource: lesson?.videoSource ?? "YOUTUBE",
      sortOrder: lesson?.sortOrder ?? 0,
      isPublished: lesson?.isPublished ?? false,
    },
  });

  const hasVideo = watch("hasVideo");
  const contentFormat = watch("contentFormat");
  const videoSource = watch("videoSource");
  const isPublished = watch("isPublished");

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      toast({
        title: tErrors("error"),
        description: t("fileSizeError"),
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(0);

    try {
      const formData = new FormData();
      // Поле называется file: так его ждёт api
      formData.append("file", file);

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
            reject(new Error("Upload error"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error(t("networkError"))));
        xhr.open("POST", VIDEO_UPLOAD_URL);
        xhr.send(formData);
      });

      const url = await uploadPromise;
      setUploadedVideoUrl(url);
      setValue("videoUrl", url);
      toast({
        title: tSuccess("success"),
        description: t("videoSuccess"),
      });
    } catch {
      toast({
        title: tErrors("error"),
        description: t("videoUploadFailed"),
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
        contentFormat: data.contentFormat,
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
          title: tSuccess("success"),
          description: lesson ? t("lessonUpdated") : t("lessonCreated"),
        });
        router.push(`/courses/${courseSlug}/lessons`);
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error || tErrors("somethingWentWrong"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("somethingWentWrong"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6 max-w-2xl">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">{t("lessonTitle")}</Label>
        <Input
          id="title"
          placeholder={t("lessonTitlePlaceholder")}
          {...register("title")}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      {/* Video (optional) */}
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
            {t("addVideo")}
          </Label>
        </div>

        {hasVideo && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="space-y-2">
              <Label>{t("videoSource")}</Label>
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
                    {t("youtube")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="UPLOAD" id="source-upload" />
                  <Label htmlFor="source-upload" className="cursor-pointer flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    {t("uploadFile")}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {videoSource === "YOUTUBE" && (
              <div className="space-y-2">
                <Label htmlFor="videoUrl">{t("youtubeLink")}</Label>
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
                <Label>{t("uploadVideo")}</Label>
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadProgress !== null}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadProgress !== null
                      ? t("uploadingProgress", { progress: uploadProgress })
                      : t("selectFile")}
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
                    {t("videoUploaded", { url: uploadedVideoUrl })}
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

      {/* Lesson content (required) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label htmlFor="content">{t("lessonContent")}</Label>
          <RadioGroup
            className="flex items-center gap-4"
            value={contentFormat}
            onValueChange={(value: string) =>
              setValue("contentFormat", value as LessonContentFormat)
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="MARKDOWN" id="format-markdown" />
              <Label
                htmlFor="format-markdown"
                className="cursor-pointer flex items-center gap-1 font-normal"
              >
                <FileText className="h-4 w-4" />
                {tHtml("formatMarkdown")}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="HTML" id="format-html" />
              <Label
                htmlFor="format-html"
                className="cursor-pointer flex items-center gap-1 font-normal"
              >
                <Code2 className="h-4 w-4" />
                {tHtml("formatHtml")}
              </Label>
            </div>
          </RadioGroup>
        </div>
        {contentFormat === "HTML" ? (
          <HtmlEditor
            id="content"
            value={watch("content")}
            onChange={(val) => setValue("content", val, { shouldValidate: true })}
            allowImageUpload
          />
        ) : (
          <MarkdownEditor
            id="content"
            value={watch("content")}
            onChange={(val) => setValue("content", val, { shouldValidate: true })}
            placeholder={t("contentPlaceholder")}
            rows={15}
            allowImageUpload
          />
        )}
        {errors.content && (
          <p className="text-sm text-destructive">{errors.content.message}</p>
        )}
      </div>

      {/* Sort order */}
      <div className="space-y-2">
        <Label htmlFor="sortOrder">{t("sortOrder")}</Label>
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

      {/* Published */}
      <div className="flex items-center space-x-2">
        <Switch
          id="isPublished"
          checked={isPublished}
          onCheckedChange={(checked: boolean) => setValue("isPublished", checked)}
        />
        <Label htmlFor="isPublished" className="cursor-pointer">
          {t("publish")}
        </Label>
      </div>

      {/* Buttons */}
      <div className="flex gap-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t("savingChanges")
            : lesson
              ? t("saveChanges")
              : t("createLesson")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/courses/${courseSlug}/lessons`)}
        >
          {tCommon("cancel")}
        </Button>
      </div>
    </form>
  );
}
