import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from "lms";
import { Trash2 } from "lucide-react";

export const DeleteStudent = () => (
  <div style={{ height: 380 }}>
    <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить студента?</AlertDialogTitle>
          <AlertDialogDescription>
            Студент Азиз Каримов будет удалён из группы «Веб-разработка А-1».
            Его оценки и посещаемость будут потеряны. Это действие необратимо.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);

export const PublishCourse = () => (
  <div style={{ height: 360 }}>
    <AlertDialog defaultOpen>
      <AlertDialogTrigger asChild>
        <Button>Опубликовать курс</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Опубликовать курс «Английский язык B1»?</AlertDialogTitle>
          <AlertDialogDescription>
            Курс станет доступен всем студентам портала. Уроки и домашние
            задания можно будет редактировать после публикации.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction>Опубликовать</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);

export const TriggerOnly = () => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant="destructive">
        <Trash2 className="mr-2 h-4 w-4" />
        Удалить группу
      </Button>
    </AlertDialogTrigger>
  </AlertDialog>
);
