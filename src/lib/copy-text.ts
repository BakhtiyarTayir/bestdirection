/** Копирование в буфер; false — браузер не разрешил (http, нет прав). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
