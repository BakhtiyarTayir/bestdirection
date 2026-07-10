import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "lms";

// ToastViewport is position:fixed by default and would escape the story cell —
// className="static" wins via tailwind-merge and keeps the toast in flow.

export const GradePosted = () => (
  <div style={{ width: 400 }}>
    <ToastProvider swipeDirection="right">
      <Toast open duration={100000}>
        <div className="grid gap-1">
          <ToastTitle>Оценка выставлена</ToastTitle>
          <ToastDescription>
            «Flexbox и Grid» — 92 балла из 100
          </ToastDescription>
        </div>
        <ToastAction altText="Открыть журнал оценок">Открыть</ToastAction>
        <ToastClose />
      </Toast>
      <ToastViewport className="static p-0" />
    </ToastProvider>
  </div>
);

export const ScheduleChanged = () => (
  <div style={{ width: 400 }}>
    <ToastProvider swipeDirection="right">
      <Toast open duration={100000}>
        <div className="grid gap-1">
          <ToastTitle>Занятие перенесено</ToastTitle>
          <ToastDescription>
            Лекция «Асинхронный JavaScript» — 17 июля, 18:00
          </ToastDescription>
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport className="static p-0" />
    </ToastProvider>
  </div>
);

export const DeadlineMissed = () => (
  <div style={{ width: 400 }}>
    <ToastProvider swipeDirection="right">
      <Toast open variant="destructive" duration={100000}>
        <div className="grid gap-1">
          <ToastTitle>Дедлайн пропущен</ToastTitle>
          <ToastDescription>
            Задание «SQL-запросы» не сдано до 8 июля, 23:59
          </ToastDescription>
        </div>
        <ToastAction altText="Запросить продление срока">Продлить</ToastAction>
        <ToastClose />
      </Toast>
      <ToastViewport className="static p-0" />
    </ToastProvider>
  </div>
);
