"use client";

import { useState } from "react";
import { intlLocale } from "@/i18n/config";
import { useRouter, Link } from "@/i18n/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { BookOpen, Loader2, Check, Clock, RotateCcw } from "lucide-react";
import {
  enrollInFreeCourse,
  requestEnrollment,
} from "@/lib/api/courses";

interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  accessType: "CLOSED" | "FREE" | "PAID";
  price: number | null;
  seatsLeft: number | null;
  teacher: { firstName: string; lastName: string };
  _count: { enrollments: number; lessons: number };
  isEnrolled: boolean;
  myRequestStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
}

export function CatalogCourseCard({ course }: { course: CatalogCourse }) {
  const t = useTranslations("catalogStudent");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const priceFormatter = new Intl.NumberFormat(intlLocale(locale));
  const isFree = course.accessType === "FREE";
  const noSeats = course.seatsLeft !== null && course.seatsLeft <= 0;

  function errorText(code?: string): string {
    switch (code) {
      case "noSeatsLeft":
        return t("noSeatsLeft");
      case "alreadyEnrolled":
        return t("alreadyEnrolled");
      case "alreadyRequested":
        return t("requestPending");
      default:
        return t("actionFailed");
    }
  }

  const onEnrollFree = async () => {
    setLoading(true);
    const result = await enrollInFreeCourse(course.id);
    if (result.success) {
      toast({ title: t("enrolledToast") });
      router.push(`/courses/${course.slug}`);
      router.refresh();
      return;
    }
    toast({
      title: errorText(result.error),
      variant: "destructive",
    });
    setLoading(false);
    router.refresh();
  };

  const onRequest = async () => {
    setLoading(true);
    const result = await requestEnrollment(course.id);
    if (result.success) {
      toast({ title: t("requestSentToast"), description: t("requestSentHint") });
    } else {
      toast({ title: errorText(result.error), variant: "destructive" });
    }
    setLoading(false);
    router.refresh();
  };

  let action: React.ReactNode;
  if (course.isEnrolled) {
    action = (
      <Link href={`/courses/${course.slug}`} className="w-full">
        <Button variant="secondary" className="w-full">
          <Check className="mr-2 h-4 w-4" />
          {t("enrolled")}
        </Button>
      </Link>
    );
  } else if (!isFree && course.myRequestStatus === "PENDING") {
    action = (
      <Button variant="outline" className="w-full" disabled>
        <Clock className="mr-2 h-4 w-4" />
        {t("requestPending")}
      </Button>
    );
  } else if (noSeats) {
    action = (
      <Button variant="outline" className="w-full" disabled>
        {t("noSeatsLeft")}
      </Button>
    );
  } else if (isFree) {
    action = (
      <Button className="w-full" onClick={onEnrollFree} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("enrollFree")}
      </Button>
    );
  } else if (course.myRequestStatus === "REJECTED") {
    action = (
      <Button
        variant="outline"
        className="w-full"
        onClick={onRequest}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="mr-2 h-4 w-4" />
        )}
        {t("requestAgain")}
      </Button>
    );
  } else {
    action = (
      <Button className="w-full" onClick={onRequest} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("requestEnroll")}
      </Button>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      {course.coverImage ? (
        <div className="relative h-40 w-full">
          <Image
            src={course.coverImage}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-muted">
          <BookOpen className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{course.title}</CardTitle>
          <Badge variant={isFree ? "secondary" : "default"} className="shrink-0">
            {isFree
              ? t("freeBadge")
              : course.price
              ? `${priceFormatter.format(course.price)} UZS`
              : t("paidBadge")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        {course.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t("teacher")}: {course.teacher.firstName} {course.teacher.lastName}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("lessonsCount", { count: course._count.lessons })}
          {course.seatsLeft !== null &&
            course.seatsLeft > 0 &&
            !course.isEnrolled &&
            ` · ${t("seatsLeft", { count: course.seatsLeft })}`}
        </p>
        {!isFree && course.myRequestStatus === "REJECTED" && (
          <p className="text-sm text-destructive">{t("requestRejected")}</p>
        )}
      </CardContent>
      <CardFooter>{action}</CardFooter>
    </Card>
  );
}
