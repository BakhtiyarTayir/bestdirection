/**
 * Тексты уведомлений бота. Перенесены из src/lib/telegram/messages.ts в web
 * дословно — пока только те, что нужны заявкам на курсы. Остальные приедут с
 * ботом на этапе 6. Язык узбекский, как в боте (аудит 4.6 — двуязычие бота
 * остаётся открытым).
 */
export const botMessages = {
  newEnrollmentRequest: (courseTitle: string, studentName: string, phone: string | null | undefined) =>
    `📝 «${courseTitle}» kursiga yangi ariza\n` +
    `O'quvchi: ${studentName}` +
    (phone ? `\nTelefon: ${phone}` : "") +
    "\n\nArizani kabinetdagi «Kurslarga arizalar» bo'limida tasdiqlang yoki rad eting.",

  enrollmentApproved: (courseTitle: string) =>
    `✅ «${courseTitle}» kursiga arizangiz tasdiqlandi!\n` +
    "Kurs kabinetingizdagi «Kurslar» bo'limida ochiq.",

  enrollmentRejected: (courseTitle: string) =>
    `❌ «${courseTitle}» kursiga arizangiz rad etildi.\n` +
    "Agar bu xato bo'lsa — o'quv markazi bilan bog'laning va arizani qaytadan yuboring.",
} as const;
