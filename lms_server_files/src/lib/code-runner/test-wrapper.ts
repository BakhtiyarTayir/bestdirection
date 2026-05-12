export function wrapCodeForTest(language: string, code: string, testInput: string): string {
  let args: unknown[];
  try {
    args = JSON.parse(`[${testInput}]`);
  } catch {
    args = [testInput];
  }

  const argsString = args.map((a) => JSON.stringify(a)).join(", ");
  const funcName = extractFunctionName(code, language);

  switch (language) {
    case "PYTHON":
      return `${code}\n\nif __name__ == "__main__":\n    print(${funcName}(${argsString}))`;
    case "JAVASCRIPT":
    case "TYPESCRIPT":
      return `${code}\n\nconsole.log(${funcName}(${argsString}));`;
    case "PHP":
      return `<?php\n${code}\n\necho ${funcName}(${argsString});\n?>`;
    case "JAVA":
      return code;
    case "CSHARP":
      return code;
    default:
      return code;
  }
}

function extractFunctionName(code: string, language: string): string {
  const patterns: Record<string, RegExp> = {
    PYTHON: /def\s+(\w+)\s*\(/,
    JAVASCRIPT: /function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=/,
    TYPESCRIPT: /function\s+(\w+)\s*\(|(?:const|let)\s+(\w+)\s*=/,
    PHP: /function\s+(\w+)\s*\(/,
  };
  const match = code.match(patterns[language] || /./);
  return match?.[1] || match?.[2] || "solution";
}
