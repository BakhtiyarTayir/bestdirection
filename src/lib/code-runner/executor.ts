import { LANGUAGE_CONFIG, PISTON_API_URL } from "./config";

export interface ExecuteResult {
  success: boolean;
  output: string;
  error: string | null;
  executionTime: number;
}

interface PistonRuntime {
  language: string;
  version: string;
  aliases?: string[];
}

let runtimesCache:
  | {
      expiresAt: number;
      data: PistonRuntime[];
    }
  | undefined;

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map((x) => parseInt(x, 10) || 0);
  const bParts = b.split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function getPistonRuntimes(): Promise<PistonRuntime[]> {
  const now = Date.now();
  if (runtimesCache && now < runtimesCache.expiresAt) {
    return runtimesCache.data;
  }

  const response = await fetch(`${PISTON_API_URL}/runtimes`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as PistonRuntime[];
  runtimesCache = {
    data,
    expiresAt: now + 5 * 60 * 1000,
  };
  return data;
}

function pickBestRuntimeVersion(
  runtimes: PistonRuntime[],
  language: string,
  preferredVersion: string
): string {
  const candidates = runtimes
    .filter(
      (r) => r.language === language || (Array.isArray(r.aliases) && r.aliases.includes(language))
    )
    .map((r) => r.version);

  if (candidates.length === 0) return preferredVersion;
  if (candidates.includes(preferredVersion)) return preferredVersion;

  return candidates.sort(compareVersions).at(-1) || preferredVersion;
}

async function callPistonExecute(
  language: string,
  version: string,
  code: string,
  timeoutMs: number,
  stdin?: string
) {
  return fetch(`${PISTON_API_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language,
      version,
      files: [{ content: code }],
      run_timeout: timeoutMs,
      ...(stdin !== undefined && { stdin }),
    }),
  });
}

export async function executeCode(
  language: string,
  code: string,
  timeoutMs: number = 5000,
  stdin?: string
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
    let response = await callPistonExecute(
      config.pistonName,
      config.pistonVersion,
      code,
      timeoutMs,
      stdin
    );
    let errorBody: unknown = null;

    if (!response.ok) {
      try {
        errorBody = await response.json();
      } catch {
        try {
          errorBody = await response.text();
        } catch {
          errorBody = null;
        }
      }
    }

    if (
      !response.ok &&
      response.status === 400 &&
      typeof errorBody === "object" &&
      errorBody !== null &&
      "message" in errorBody &&
      typeof errorBody.message === "string" &&
      errorBody.message.includes("runtime is unknown")
    ) {
      const runtimes = await getPistonRuntimes();
      const fallbackVersion = pickBestRuntimeVersion(
        runtimes,
        config.pistonName,
        config.pistonVersion
      );
      if (fallbackVersion !== config.pistonVersion) {
        response = await callPistonExecute(
          config.pistonName,
          fallbackVersion,
          code,
          timeoutMs,
          stdin
        );

        if (!response.ok) {
          try {
            errorBody = await response.json();
          } catch {
            try {
              errorBody = await response.text();
            } catch {
              errorBody = null;
            }
          }
        } else {
          errorBody = null;
        }
      }
    }

    if (!response.ok) {
      const errorMessage =
        typeof errorBody === "object" &&
        errorBody !== null &&
        "message" in errorBody &&
        typeof errorBody.message === "string"
          ? errorBody.message
          : `API error: ${response.status}`;
      return {
        success: false,
        output: "",
        error: errorMessage,
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
