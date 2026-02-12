export const LANGUAGE_CONFIG: Record<
  string,
  { pistonName: string; pistonVersion: string; monacoLanguage: string }
> = {
  PYTHON: { pistonName: "python", pistonVersion: "3.10", monacoLanguage: "python" },
  JAVASCRIPT: { pistonName: "javascript", pistonVersion: "18.15", monacoLanguage: "javascript" },
  TYPESCRIPT: { pistonName: "typescript", pistonVersion: "5.0", monacoLanguage: "typescript" },
  PHP: { pistonName: "php", pistonVersion: "8.2", monacoLanguage: "php" },
  JAVA: { pistonName: "java", pistonVersion: "15.0", monacoLanguage: "java" },
  CSHARP: { pistonName: "csharp", pistonVersion: "6.12", monacoLanguage: "csharp" },
};

export const LANGUAGE_LABELS: Record<string, string> = {
  PYTHON: "Python",
  JAVASCRIPT: "JavaScript",
  TYPESCRIPT: "TypeScript",
  PHP: "PHP",
  JAVA: "Java",
  CSHARP: "C#",
};

export const PISTON_API_URL = "https://emkc.org/api/v2/piston";
