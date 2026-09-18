/**
 * Тексты бота. Перенесено из src/lib/telegram/messages.ts в web.
 *
 * Сообщения идут ученикам и родителям, язык у них один — узбекский, как и в
 * кабинете. Языка запроса у Telegram-апдейта нет, локаль пользователя нигде
 * не хранится, поэтому словарь next-intl здесь не применим; если понадобится
 * второй язык, эти функции останутся единственным местом правки
 * (аудит 4.6 — двуязычие бота остаётся открытым).
 */
export const botMessages = {
  linkedGreeting: (firstName: string, lastName: string) =>
    `Siz ${firstName} ${lastName} sifatida bog'langansiz.\n\n` +
    "Buyruqlar:\n" +
    "/homework — faol vazifalar\n" +
    "/unlink — hisobni uzish\n\n" +
    "Tekshirish uchun kod fayli (.py, .js va hokazo) yuboring.",

  notLinkedGreeting:
    "Assalomu alaykum! Hisobingizni saytdagi shaxsiy kabinet orqali bog'lang.\n" +
    "Profil → Telegramni bog'lash bo'limiga o'ting.",

  linkAccountFirst: "Avval saytda hisobingizni bog'lang.",
  noActiveHomework: "Sizda faol vazifalar yo'q.",
  activeHomeworkHeader: "Faol vazifalar:\n\n",
  homeworkCourse: (title: string) => `  Kurs: ${title}`,
  homeworkAttempts: (attempts: string, due: string) =>
    `  Urinishlar: ${attempts} | Muddat: ${due}`,
  sendCodeFile: "Tekshirish uchun kod fayli yuboring.",

  accountNotLinked: "Hisob bog'lanmagan.",
  accountUnlinked: "Hisob uzildi. Sayt orqali qaytadan bog'lang.",

  fileFetchFailed: "Faylni olishning iloji bo'lmadi.",
  fileTooLargeCode: "Fayl juda katta (maks. 100 KB).",
  fileTooLargeUpload: "Fayl juda katta (maks. 5 MB).",
  emptyFile: "Fayl bo'sh.",

  noHomeworkForLanguage: "Bu til uchun faol vazifa yo'q.",
  noFileHomework: "Fayl yuklash uchun vazifa yo'q.",
  chooseHomeworkToCheck: "Tekshirish uchun vazifani tanlang:",
  chooseHomeworkToUpload: "Fayl yuklash uchun vazifani tanlang:",
  resendFile: "Faylni qaytadan yuboring.",
  selectionExpired: "Fayl tanlash sessiyasi tugadi. Faylni qaytadan yuboring.",

  loginCodeNotFound:
    "Kirish kodi topilmadi yoki muddati o'tgan. Saytga qaytib qayta urinib ko'ring.",
  loginCodeExpired: "Kirish kodi topilmadi yoki muddati o'tgan.",
  confirmLoginButton: "✅ Kirishni tasdiqlash",
  loginPrompt:
    "O'quv markazi saytiga kirish.\n\n" +
    "Agar saytda «Telegram orqali kirish» tugmasini siz bosgan bo'lsangiz — kirishni tasdiqlang. " +
    "Aks holda bu xabarni e'tiborsiz qoldiring.",
  loginConfirmedShort: "Kirish tasdiqlandi",
  loginConfirmed:
    "Kirish tasdiqlandi ✅ Saytga qayting — tizimga avtomatik kirasiz.",

  linkCodeNotFound:
    "Bog'lash kodi topilmadi yoki muddati o'tgan. Sayt orqali qaytadan urinib ko'ring.",
  telegramAlreadyTaken: (firstName: string, lastName: string) =>
    `Bu Telegram allaqachon ${firstName} ${lastName} hisobiga bog'langan.\n` +
    "Avval o'sha hisob profilida uni uzing (yoki administratorga murojaat qiling), " +
    "so'ng bog'lashni takrorlang.",
  accountLinked: (firstName: string, lastName: string) =>
    `Hisob bog'landi! ${firstName} ${lastName}\n\n` +
    "Endi avtomatik tekshirish uchun kod fayllarini yuborishingiz mumkin.\n" +
    "/homework — vazifalarni ko'rish",

  checkingFile: (fileName: string) => `${fileName} tekshirilmoqda...`,
  uploadingFile: (fileName: string) => `${fileName} yuklanmoqda...`,
  submissionAccepted: "Ishingiz tekshiruv tizimiga qabul qilindi.",
  checkFailed: "Tekshirishda xato yuz berdi. Keyinroq urinib ko'ring.",
  uploadFailed: "Faylni yuklashda xato yuz berdi. Keyinroq urinib ko'ring.",

  testResult: (passed: number, total: number, percentage: number) =>
    `Natija: ${passed}/${total} testdan (${percentage}%)`,
  finalScoreWithPenalty: (finalScore: number) => `Jarima bilan jami: ${finalScore}%`,
  errorsHeader: "Xatolar:",

  homeworkNotFoundOrUnpublished: "Vazifa topilmadi yoki e'lon qilinmagan.",
  notEnrolled: "Siz kursga yozilmagansiz.",
  deadlineExpired: "Topshirish muddati tugagan.",
  attemptsExhausted: "Urinishlar tugadi.",

  fileSubmitted: (title: string, attempt: number, maxAttempts: number) =>
    "Fayl tekshiruvga yuborildi!\n\n" +
    `Vazifa: ${title}\n` +
    `Urinish: ${attempt}/${maxAttempts}\n` +
    "Holat: Tekshiruvda",
  latePenaltyNote: (penalty: number) =>
    `\n⚠️ Muddatdan keyin yuborildi (jarima ${penalty}%)`,

  submitError: (code: string) => `Xato: ${code}`,

  // Уведомления о заявках на курс: уходят преподавателю и студенту
  newEnrollmentRequest: (
    courseTitle: string,
    studentName: string,
    phone: string | null | undefined
  ) =>
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

/** Причины отказа от submitSolutionInternal — в текст для студента. */
export const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  homeworkNotFound: "Vazifa topilmadi.",
  homeworkNotPublished: "Vazifa e'lon qilinmagan.",
  languageNotSpecified: "Dasturlash tili ko'rsatilmagan.",
  notEnrolled: botMessages.notEnrolled,
  deadlineExpired: botMessages.deadlineExpired,
  maxAttemptsReached: botMessages.attemptsExhausted,
};
