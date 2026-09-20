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
    // Prisma и NextAuth в web больше нет вовсе (этап 9): данные и вход —
    // только через src/lib/api/*. Правило оставлено страховкой от возврата
    // прямого доступа к базе.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/prisma", message: "web не ходит в базу — только через src/lib/api/*" },
            { name: "@/generated/prisma", message: "web не ходит в базу — только через src/lib/api/*" },
            { name: "next-auth", message: "вход живёт в api (этап 9)" },
            { name: "next-auth/react", message: "вход живёт в api (этап 9)" },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
