import { executeCode } from "./executor";
import { wrapCodeForTest } from "./test-wrapper";

export interface TestCaseInput {
  id: string;
  input: string;
  expected: string;
  points: number;
}

export interface TestRunResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: string | null;
  error: string | null;
  executionTime: number;
  points: number;
}

export async function runAllTests(
  language: string,
  code: string,
  testCases: TestCaseInput[],
  timeoutMs: number
): Promise<TestRunResult[]> {
  const results: TestRunResult[] = [];
  const usesStdin = detectStdinUsage(language, code);

  for (const tc of testCases) {
    let result;
    if (usesStdin) {
      // stdin-based: run code as-is, pass test input via stdin
      result = await executeCode(language, code, timeoutMs, tc.input);
    } else {
      // function-based: wrap code to call the function with arguments
      const wrappedCode = wrapCodeForTest(language, code, tc.input);
      result = await executeCode(language, wrappedCode, timeoutMs);
    }

    const passed = result.success && result.output.trim() === tc.expected.trim();

    results.push({
      testCaseId: tc.id,
      passed,
      actualOutput: result.success ? result.output : null,
      error: result.error,
      executionTime: result.executionTime,
      points: tc.points,
    });
  }

  return results;
}

function detectStdinUsage(language: string, code: string): boolean {
  const patterns: Record<string, RegExp> = {
    PYTHON: /\binput\s*\(/,
    JAVASCRIPT: /\breadline\b|\bprocess\.stdin\b/,
    TYPESCRIPT: /\breadline\b|\bprocess\.stdin\b/,
    PHP: /\bfgets\s*\(\s*STDIN\b|\breadline\s*\(/,
    JAVA: /\bScanner\b.*\bSystem\.in\b|\bBufferedReader\b/,
    CSHARP: /\bConsole\.ReadLine\b/,
  };
  const pattern = patterns[language];
  return pattern ? pattern.test(code) : false;
}
