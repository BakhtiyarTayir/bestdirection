import { LANGUAGE_CONFIG, PISTON_API_URL } from "./config";

export interface ExecuteResult {
  success: boolean;
  output: string;
  error: string | null;
  executionTime: number;
}

export async function executeCode(
  language: string,
  code: string,
  timeoutMs: number = 5000
): Promise<ExecuteResult> {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    return {
      success: false,
      output: "",
      error: `Language ${language} is not supported`,
      executionTime: 0,
    };
  }

  const startTime = Date.now();

  try {
    const response = await fetch(`${PISTON_API_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: config.pistonName,
        version: config.pistonVersion,
        files: [{ content: code }],
        run_timeout: timeoutMs,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        output: "",
        error: `API error: ${response.status}`,
        executionTime: Date.now() - startTime,
      };
    }

    const result = await response.json();
    const executionTime = Date.now() - startTime;

    // Compilation error
    if (result.compile?.code !== 0 && result.compile) {
      return {
        success: false,
        output: "",
        error: result.compile.stderr || "Compilation error",
        executionTime,
      };
    }

    // Runtime error
    if (result.run.code !== 0) {
      return {
        success: false,
        output: result.run.stdout || "",
        error: result.run.stderr || "Runtime error",
        executionTime,
      };
    }

    return {
      success: true,
      output: result.run.stdout?.trim() || "",
      error: null,
      executionTime,
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: error instanceof Error ? error.message : "Unknown error",
      executionTime: Date.now() - startTime,
    };
  }
}
