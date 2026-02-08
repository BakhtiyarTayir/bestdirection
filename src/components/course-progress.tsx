import { Progress } from "@/components/ui/progress";

interface CourseProgressProps {
  total: number;
  completed: number;
  percentage: number;
}

export function CourseProgress({ total, completed, percentage }: CourseProgressProps) {
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Пройдено {completed} из {total} уроков
        </span>
        <span className="font-medium">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}
