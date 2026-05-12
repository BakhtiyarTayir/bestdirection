"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyCourseDialog } from "./copy-course-dialog";
import { Copy, BookOpen, FileText, Users } from "lucide-react";
import { useTranslations } from "next-intl";

interface Course {
  id: string;
  title: string;
  description: string | null;
  isTemplate: boolean;
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count: {
    lessons: number;
    assessments: number;
    copies: number;
  };
}

interface CourseCatalogListProps {
  courses: Course[];
}

export function CourseCatalogList({ courses }: CourseCatalogListProps) {
  const tCopy = useTranslations("copyCourse");
  const tCommon = useTranslations("common");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <Card key={course.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg line-clamp-2">
                  {course.title}
                </CardTitle>
                {course.isTemplate && (
                  <Badge variant="secondary" className="shrink-0">
                    {tCommon("template")}
                  </Badge>
                )}
              </div>
              <CardDescription>
                {course.teacher.firstName} {course.teacher.lastName}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              {course.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {course.description}
                </p>
              )}

              <div className="flex flex-wrap gap-3 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4" />
                  {tCopy("lessonsCount", { count: course._count.lessons })}
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {tCopy("examsCount", { count: course._count.assessments })}
                </span>
                {course._count.copies > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {tCopy("copiesCount", { count: course._count.copies })}
                  </span>
                )}
              </div>
            </CardContent>

            <CardFooter>
              <Button
                className="w-full"
                onClick={() => setSelectedCourse(course)}
              >
                <Copy className="mr-2 h-4 w-4" />
                {tCommon("copy")}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {selectedCourse && (
        <CopyCourseDialog
          sourceCourse={selectedCourse}
          open={!!selectedCourse}
          onOpenChange={(open) => !open && setSelectedCourse(null)}
        />
      )}
    </>
  );
}
