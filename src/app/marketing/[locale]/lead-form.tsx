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
  courses: { slug: string; title: string }[];
}

export function LeadForm({ courses }: LeadFormProps) {
  const t = useTranslations("marketing.leadForm");
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [courseSlug, setCourseSlug] = useState(courses[0]?.slug ?? "");

  async function handleSubmit(formData: FormData) {
    if (!courseSlug) return;
    setSubmitting(true);
    try {
      const result = await submitCourseLead({
        courseSlug,
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
      <p role="status" className="rounded-lg bg-[#f9f3e8] px-6 py-8 text-center text-[#191211] font-medium">
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
          <Label htmlFor="course">{t("courseLabel")}</Label>
          <Select value={courseSlug} onValueChange={setCourseSlug}>
            <SelectTrigger id="course">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courses.map((course) => (
                <SelectItem key={course.slug} value={course.slug}>
                  {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fullName">{t("nameLabel")}</Label>
        <Input id="fullName" name="fullName" autoComplete="name" placeholder={t("namePlaceholder")} required minLength={2} maxLength={100} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{t("phoneLabel")}</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder={t("phonePlaceholder")} required minLength={5} maxLength={30} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">{t("messageLabel")}</Label>
        <Textarea id="message" name="message" placeholder={t("messagePlaceholder")} maxLength={1000} />
      </div>

      <Button type="submit" disabled={submitting} className="w-full bg-[#F6B93B] text-[#120d0c] hover:bg-[#d99a22]">
        {submitting ? (
          <>
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          t("submit")
        )}
      </Button>
    </form>
  );
}
