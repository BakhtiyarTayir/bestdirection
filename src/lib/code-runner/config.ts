export const LANGUAGE_CONFIG: Record<
  string,
  { pistonName: string; pistonVersion: string; monacoLanguage: string }
> = {
  PYTHON: { pistonName: "python", pistonVersion: "3.10.0", monacoLanguage: "python" },
  JAVASCRIPT: { pistonName: "javascript", pistonVersion: "18.15.0", monacoLanguage: "javascript" },
  TYPESCRIPT: { pistonName: "typescript", pistonVersion: "5.0.3", monacoLanguage: "typescript" },
  PHP: { pistonName: "php", pistonVersion: "8.2.3", monacoLanguage: "php" },
  JAVA: { pistonName: "java", pistonVersion: "15.0.2", monacoLanguage: "java" },
  CSHARP: { pistonName: "csharp", pistonVersion: "6.12.0", monacoLanguage: "csharp" },
};

export const LANGUAGE_LABELS: Record<string, string> = {
  PYTHON: "Python",
  JAVASCRIPT: "JavaScript",
  TYPESCRIPT: "TypeScript",
  PHP: "PHP",
  JAVA: "Java",
  CSHARP: "C#",
};

export const PISTON_API_URL = process.env.PISTON_API_URL || "http://localhost:2000/api/v2";

// Автопроверка кода выключена: Piston в проде не поднят, на VPS с 956 МБ он не
// помещается (решение владельца 2026-09-17, MIGRATION-NESTJS.md раздел 0). Без
// него каждая сдача CODE-задания падала в ERROR. Пока false, задание типа CODE
// нельзя создать ни формой, ни импортом, ни прямым вызовом action.
export const CODE_HOMEWORK_ENABLED = false;

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".py": "PYTHON",
  ".js": "JAVASCRIPT",
  ".ts": "TYPESCRIPT",
  ".php": "PHP",
  ".java": "JAVA",
  ".cs": "CSHARP",
};

export function detectLanguageFromExtension(filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return EXT_TO_LANGUAGE[ext] || null;
}
