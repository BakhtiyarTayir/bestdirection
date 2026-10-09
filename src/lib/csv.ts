/** CSV для Excel: разделитель «;», UTF-8 с BOM — иначе кириллица и узбекские буквы ломаются. */
export function toCsv(lines: string[][]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return "\uFEFF" + lines.map((line) => line.map(cell).join(";")).join("\r\n");
}

/** Отдаёт браузеру файл CSV на скачивание. */
export function downloadCsv(filename: string, lines: string[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(lines)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
