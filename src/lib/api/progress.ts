// Успеваемость ученика (GET /progress/students/:studentId): посещаемость за
// выбранный месяц, домашние задания, тесты и прогресс по урокам — накопительно
// по каждому курсу, на который ребёнок записан. Доступ (свой ребёнок/сам
// ученик/ученик своей группы/администратор) решает api, ответ здесь только
// описывает форму данных.

export interface ApiProgressAttendance {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** null — занятий в журнале за месяц не было */
  percent: number | null;
  /** Даты пропусков (ABSENT), "YYYY-MM-DD" */
  absentDates: string[];
}

export interface ApiProgressHomeworkItem {
  id: string;
  slug: string;
  title: string;
  lessonSlug: string;
  /** "YYYY-MM-DD" */
  dueDate: string | null;
  submitted: boolean;
  missed: boolean;
  status: string | null;
  manualStatus: string | null;
  reviewed: boolean;
  percent: number | null;
  teacherComment: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
}

export interface ApiProgressTestItem {
  assessmentId: string;
  title: string;
  type: "TEST" | "EXAM";
  percent: number;
  completedAt: string;
  attemptsCount: number;
}

export interface ApiProgressCourse {
  course: { id: string; title: string; slug: string };
  attendance: ApiProgressAttendance;
  homework: {
    total: number;
    done: number;
    avgPercent: number | null;
    items: ApiProgressHomeworkItem[];
  };
  tests: {
    items: ApiProgressTestItem[];
    avgPercent: number | null;
  };
  lessons: { total: number; completed: number };
}

export interface ApiProgress {
  student: { id: string; firstName: string; lastName: string };
  month: string;
  totals: {
    attendancePercent: number | null;
    homeworkDone: number;
    homeworkTotal: number;
    homeworkAvgPercent: number | null;
    testAvgPercent: number | null;
  };
  courses: ApiProgressCourse[];
}
