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

  for (const tc of testCases) {
    const wrappedCode = wrapCodeForTest(language, code, tc.input);
    const result = await executeCode(language, wrappedCode, timeoutMs);

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
