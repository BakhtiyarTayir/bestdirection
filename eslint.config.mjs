import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    // api/ — отдельный проект NestJS со своим eslint
    "api/**",
  ]),
  {
    // Перенесено в api (этап 2): эти файлы ходят в данные только через
    // src/lib/api/*. Список растёт с каждым перенесённым модулем, на этапе 9
    // запрет станет общим для всего web.
    // Без сегмента [locale]: в шаблонах ESLint квадратные скобки — класс
    // символов, и путь с ними не совпал бы никогда
    files: [
      "src/app/**/users/**",
      "src/app/**/teachers/**",
      "src/app/**/profile/**",
      "src/app/**/statistics/**",
      "src/app/**/audit/**",
      "src/app/**/payments/**",
      "src/app/**/trash/**",
      "src/app/**/courses/browse/**",
      "src/app/**/courses/catalog/**",
      "src/app/**/courses/requests/**",
      "src/app/**/admin/compare/**",
      "src/app/**/attendance/**",
      "src/app/**/my-children/**",
      "src/app/**/groups/**",
      // Этап 4: уроки, тесты и экзамены. Страницы урока и его правки пока
      // не в списке — там остаётся прямое чтение заданий до этапа 5.
      "src/app/**/lessons/**/test/**",
      "src/app/**/lessons/new/**",
      "src/app/**/exams/**",
      "src/app/**/my-results/**",
      // Этап 5: задания, работы и файлы
      "src/app/**/homework/**",
      "src/app/**/lessons/**/edit/**",
      "src/app/(public)/**",
      "src/app/**/(public)/**",
      // Этап 6: рассылки и бот
      "src/app/**/admin/sms/**",
      "src/components/sms/**",
      // Этап 8: сводка на главной и разрешение адресов
      "src/app/**/dashboard/**",
      "src/lib/slug-resolvers.ts",
      // Этап 7: лендинг, заявки, настройки
      "src/app/**/admin/landing/**",
      "src/app/**/admin/leads/**",
      "src/app/marketing/**",
      "src/lib/marketing-content.ts",
      "src/lib/site-settings.ts",
      "src/components/telegram-link.tsx",
      "src/components/trash-table.tsx",
      "src/components/course-form.tsx",
      "src/components/copy-course-dialog.tsx",
      "src/components/student-enrollment.tsx",
      "src/components/attendance-marking.tsx",
      "src/components/create-session-dialog.tsx",
      "src/components/parents-panel.tsx",
      "src/components/groups/**",
      "src/components/assessment-form.tsx",
      "src/components/assessment-management-buttons.tsx",
      "src/components/assessment-question-form.tsx",
      "src/components/assessment-taking.tsx",
      "src/components/attempt-detail-row.tsx",
      "src/components/export-import-buttons.tsx",
      "src/components/lesson-sidebar-nav.tsx",
      "src/components/lesson-test-tab.tsx",
      "src/components/mark-complete-button.tsx",
      "src/components/presence-heartbeat.tsx",
      "src/components/video-player.tsx",
      "src/components/homework/**",
      "src/components/course-form.tsx",
      "src/components/lesson-form.tsx",
      "src/components/html-editor.tsx",
      "src/components/markdown-editor.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/prisma", message: "Модуль перенесён в api — данные только через src/lib/api/*" },
            { name: "@/generated/prisma", message: "Модуль перенесён в api — данные только через src/lib/api/*" },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
