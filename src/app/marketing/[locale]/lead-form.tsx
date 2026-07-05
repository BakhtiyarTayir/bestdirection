"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { submitCourseLead } from "@/actions/lead-actions";
import { Loader2 } from "lucide-react";

interface LeadFormProps {
  courses: { id: string; title: string }[];
}

export function LeadForm({ courses }: LeadFormProps) {
  const t = useTranslations("marketing.leadForm");
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");

  async function handleSubmit(formData: FormData) {
    if (!courseId) return;
    setSubmitting(true);
    try {
      const result = await submitCourseLead({
        courseId,
        fullName: String(formData.get("fullName") || ""),
        phone: String(formData.get("phone") || ""),
        message: String(formData.get("message") || "") || undefined,
        website: String(formData.get("website") || ""),
      });

      if (result.success) {
        setSubmitted(true);
      } else {
        toast({
          variant: "destructive",
          description: t(result.error === "tooManyRequests" ? "tooManyRequests" : result.error === "courseNotFound" ? "courseNotFound" : result.error === "invalidInput" ? "invalidInput" : "genericError"),
        });
      }
    } catch {
      toast({ variant: "destructive", description: t("genericError") });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-lg bg-[#eef3fb] px-6 py-8 text-center text-[#16213e] font-medium">
        {t("success")}
      </p>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {/* Honeypot field, hidden from real users via CSS (not display:none, which some bots skip) */}
      <div className="absolute -left-[9999px] opacity-0" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {courses.length > 1 && (
        <div className="space-y-2">
          <Label>{t("courseLabel")}</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fullName">{t("nameLabel")}</Label>
        <Input id="fullName" name="fullName" placeholder={t("namePlaceholder")} required minLength={2} maxLength={100} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{t("phoneLabel")}</Label>
        <Input id="phone" name="phone" type="tel" placeholder={t("phonePlaceholder")} required minLength={5} maxLength={30} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">{t("messageLabel")}</Label>
        <Textarea id="message" name="message" placeholder={t("messagePlaceholder")} maxLength={1000} />
      </div>

      <Button type="submit" disabled={submitting} className="w-full bg-[#2ed47a] text-[#0f1830] hover:bg-[#24b567]">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
    </form>
  );
}
