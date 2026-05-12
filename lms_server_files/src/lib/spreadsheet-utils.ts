import * as XLSX from "xlsx";

// ---------- Types ----------

export interface SpreadsheetQuestion {
  text: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE";
  points: number;
  options: { text: string; isCorrect: boolean }[];
}

export interface SpreadsheetData {
  title: string;
  passingScore: number;
  timeLimitMin: number | null;
  maxAttempts: number;
  description: string | null;
  questions: SpreadsheetQuestion[];
}

// Max option pairs to generate in export headers
const MAX_OPTIONS = 6;

// ---------- Export: data → workbook ----------

export function dataToWorkbook(data: SpreadsheetData): XLSX.WorkBook {
  const maxOpts = Math.max(
    MAX_OPTIONS,
    ...data.questions.map((q) => q.options.length)
  );

  const rows: (string | number | boolean)[][] = [];

  // Row 1: meta headers
  rows.push([
    "title",
    "passing_score",
    "time_limit_min",
    "max_attempts",
    "description",
  ]);

  // Row 2: meta values
  rows.push([
    data.title,
    data.passingScore,
    data.timeLimitMin ?? ("" as unknown as number),
    data.maxAttempts,
    data.description ?? ("" as unknown as string),
  ]);

  // Row 3: empty separator
  rows.push([]);

  // Row 4: question headers + dynamic option columns
  const headers: string[] = ["#", "question", "type", "points"];
  for (let i = 1; i <= maxOpts; i++) {
    headers.push(`option_${i}`, `correct_${i}`);
  }
  rows.push(headers);

  // Row 5+: one row per question
  data.questions.forEach((q, qIndex) => {
    const row: (string | number | boolean)[] = [
      qIndex + 1,
      q.text,
      q.type,
      q.points,
    ];
    q.options.forEach((opt) => {
      row.push(opt.text, opt.isCorrect);
    });
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-width for key columns
  ws["!cols"] = [
    { wch: 4 },   // #
    { wch: 50 },  // question
    { wch: 18 },  // type
    { wch: 7 },   // points
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  return wb;
}

// ---------- Export: data → CSV string ----------

export function dataToCSVString(data: SpreadsheetData): string {
  const wb = dataToWorkbook(data);
  return XLSX.utils.sheet_to_csv(wb.Sheets["Data"]);
}

// ---------- Export: data → JSON string ----------

export function dataToJSONString(data: SpreadsheetData): string {
  return JSON.stringify(data, null, 2);
}

// ---------- Import: JSON string → data ----------

export function jsonToData(text: string): SpreadsheetData {
  const raw = JSON.parse(text);

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid JSON");
  }

  return {
    title: String(raw.title ?? ""),
    passingScore: Number(raw.passingScore) || 60,
    timeLimitMin: raw.timeLimitMin != null ? Number(raw.timeLimitMin) : null,
    maxAttempts: Number(raw.maxAttempts) || 1,
    description: raw.description != null ? String(raw.description) : null,
    questions: Array.isArray(raw.questions)
      ? raw.questions.map((q: Record<string, unknown>) => ({
          text: String(q.text ?? ""),
          type:
            String(q.type ?? "").toUpperCase() === "MULTIPLE_CHOICE"
              ? "MULTIPLE_CHOICE" as const
              : "SINGLE_CHOICE" as const,
          points: Number(q.points) || 1,
          options: Array.isArray(q.options)
            ? (q.options as Record<string, unknown>[]).map((o) => ({
                text: String(o.text ?? ""),
                isCorrect: Boolean(o.isCorrect),
              }))
            : [],
        }))
      : [],
  };
}

// ---------- Import: buffer → data ----------

export function bufferToData(
  buffer: Buffer,
  format: "xlsx" | "csv"
): SpreadsheetData {
  const wb = XLSX.read(buffer, {
    type: "buffer",
    ...(format === "csv" ? { raw: true } : {}),
  });

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | boolean | undefined)[][] =
    XLSX.utils.sheet_to_json(ws, { header: 1, defval: undefined });

  if (rows.length < 2) {
    throw new Error("File must contain at least 2 metadata rows");
  }

  // --- Parse metadata (rows 0-1) ---
  const metaHeaders = (rows[0] || []).map((v) => String(v ?? "").trim().toLowerCase());
  const metaValues = rows[1] || [];

  const metaMap = new Map<string, string | number | boolean | undefined>();
  metaHeaders.forEach((h, i) => {
    metaMap.set(h, metaValues[i]);
  });

  // Support both old (_meta_title) and new (title) header names
  const title = String(
    metaMap.get("title") ?? metaMap.get("_meta_title") ?? ""
  ).trim();
  const passingScore =
    Number(metaMap.get("passing_score") ?? metaMap.get("_meta_passingscore") ?? 60) || 60;
  const rawTimeLimit =
    metaMap.get("time_limit_min") ?? metaMap.get("_meta_timelimitmin");
  const timeLimitMin =
    rawTimeLimit !== undefined && rawTimeLimit !== ""
      ? Number(rawTimeLimit)
      : null;
  const maxAttempts =
    Number(metaMap.get("max_attempts") ?? metaMap.get("_meta_maxattempts") ?? 1) || 1;
  const rawDescription =
    metaMap.get("description") ?? metaMap.get("_meta_description");
  const description =
    rawDescription !== undefined && rawDescription !== ""
      ? String(rawDescription)
      : null;

  // --- Find question header row ---
  let headerRowIdx = -1;
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c === undefined || c === "")) continue;
    const firstCell = String(row[0] ?? "").trim().toLowerCase();
    if (firstCell === "#" || firstCell === "question_number") {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("Question table header not found (# or question_number)");
  }

  // Detect format: new (option_1/correct_1 pairs) vs old (option_text/is_correct)
  const qHeaders = (rows[headerRowIdx] || []).map((v) =>
    String(v ?? "").trim().toLowerCase()
  );
  const isNewFormat = qHeaders.some((h) => h.startsWith("option_"));

  const questions: SpreadsheetQuestion[] = [];

  if (isNewFormat) {
    // --- New grouped format: 1 row = 1 question ---
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => c === undefined || c === "")) continue;

      const qNum = Number(row[0]);
      if (isNaN(qNum) || qNum < 1) continue;

      const qText = String(row[1] ?? "").trim();
      const qType = String(row[2] ?? "").trim().toUpperCase();
      const points = Number(row[3]) || 1;

      const options: { text: string; isCorrect: boolean }[] = [];
      // Read option/correct pairs starting at column 4
      for (let col = 4; col < row.length; col += 2) {
        const optText = String(row[col] ?? "").trim();
        if (!optText) break;
        const isCorrect = parseBool(row[col + 1]);
        options.push({ text: optText, isCorrect });
      }

      questions.push({
        text: qText,
        type: qType === "MULTIPLE_CHOICE" ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
        points,
        options,
      });
    }
  } else {
    // --- Old flat format: 1 row = 1 option ---
    const questionsMap = new Map<
      number,
      SpreadsheetQuestion
    >();

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => c === undefined || c === "")) continue;

      const qNum = Number(row[0]);
      if (isNaN(qNum) || qNum < 1) continue;

      const qText = String(row[1] ?? "").trim();
      const qType = String(row[2] ?? "").trim().toUpperCase();
      const points = Number(row[3]) || 1;
      const optText = String(row[4] ?? "").trim();
      const isCorrect = parseBool(row[5]);

      if (!questionsMap.has(qNum)) {
        questionsMap.set(qNum, {
          text: qText,
          type: qType === "MULTIPLE_CHOICE" ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
          points,
          options: [],
        });
      }

      const q = questionsMap.get(qNum)!;
      if (optText) {
        q.options.push({ text: optText, isCorrect });
      }
    }

    questions.push(...questionsMap.values());
  }

  return {
    title,
    passingScore,
    timeLimitMin: timeLimitMin !== null && !isNaN(timeLimitMin!) ? timeLimitMin : null,
    maxAttempts,
    description,
    questions,
  };
}

// ---------- Validate ----------

export function validateSpreadsheetData(data: SpreadsheetData): string[] {
  const errors: string[] = [];

  if (!data.title.trim()) {
    errors.push("Test title cannot be empty");
  }

  if (data.passingScore < 1 || data.passingScore > 100) {
    errors.push("Passing score must be between 1 and 100");
  }

  if (data.questions.length === 0) {
    errors.push("At least one question is required");
  }

  data.questions.forEach((q, i) => {
    const num = i + 1;

    if (!q.text.trim()) {
      errors.push(`Question ${num}: text cannot be empty`);
    }

    if (q.options.length < 2) {
      errors.push(`Question ${num}: at least 2 answer options required`);
    }

    const correctCount = q.options.filter((o) => o.isCorrect).length;

    if (q.type === "SINGLE_CHOICE" && correctCount !== 1) {
      errors.push(
        `Question ${num}: SINGLE_CHOICE must have exactly 1 correct answer (found: ${correctCount})`
      );
    }

    if (q.type === "MULTIPLE_CHOICE" && correctCount < 1) {
      errors.push(
        `Question ${num}: MULTIPLE_CHOICE must have at least 1 correct answer`
      );
    }
  });

  return errors;
}

// ---------- Helpers ----------

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "да";
}
