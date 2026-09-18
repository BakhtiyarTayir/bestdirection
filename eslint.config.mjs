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
      "src/components/telegram-link.tsx",
      "src/components/trash-table.tsx",
      "src/components/course-form.tsx",
      "src/components/copy-course-dialog.tsx",
      "src/components/student-enrollment.tsx",
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
