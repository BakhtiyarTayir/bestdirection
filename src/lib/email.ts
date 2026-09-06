const RESEND_API_URL = "https://api.resend.com/emails";

const FROM =
  process.env.EMAIL_FROM || "Best Direction <no-reply@bestdirection.uz>";

interface VerificationEmailTexts {
  subject: string;
  greeting: string;
  codeIntro: string;
  expires: string;
  ignore: string;
}

export type VerificationEmailKind = "register" | "reset";

const TEXTS: Record<VerificationEmailKind, Record<string, VerificationEmailTexts>> = {
  register: {
    ru: {
      subject: "Код подтверждения регистрации",
      greeting: "Здравствуйте!",
      codeIntro: "Ваш код подтверждения для регистрации в учебном центре:",
      expires: "Код действует 15 минут.",
      ignore: "Если вы не регистрировались — просто проигнорируйте это письмо.",
    },
    uz: {
      subject: "Ro'yxatdan o'tishni tasdiqlash kodi",
      greeting: "Assalomu alaykum!",
      codeIntro: "O'quv markazida ro'yxatdan o'tish uchun tasdiqlash kodingiz:",
      expires: "Kod 15 daqiqa davomida amal qiladi.",
      ignore: "Agar siz ro'yxatdan o'tmagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.",
    },
  },
  reset: {
    ru: {
      subject: "Код для сброса пароля",
      greeting: "Здравствуйте!",
      codeIntro: "Ваш код для сброса пароля в учебном центре:",
      expires: "Код действует 15 минут.",
      ignore: "Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо, ваш пароль не изменится.",
    },
    uz: {
      subject: "Parolni tiklash kodi",
      greeting: "Assalomu alaykum!",
      codeIntro: "O'quv markazida parolni tiklash uchun kodingiz:",
      expires: "Kod 15 daqiqa davomida amal qiladi.",
      ignore: "Agar siz parolni tiklashni so'ramagan bo'lsangiz, bu xatni e'tiborsiz qoldiring — parolingiz o'zgarmaydi.",
    },
  },
};

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendVerificationEmail(
  to: string,
  code: string,
  locale: string,
  kind: VerificationEmailKind = "register"
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const t = TEXTS[kind][locale] ?? TEXTS[kind].ru;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #7f1d1d; margin-bottom: 8px;">Best Direction</h2>
      <p>${t.greeting}</p>
      <p>${t.codeIntro}</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; background: #f5f5f5; border-radius: 8px; padding: 16px; text-align: center;">${code}</p>
      <p style="color: #666;">${t.expires}</p>
      <p style="color: #999; font-size: 13px;">${t.ignore}</p>
    </div>`;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: t.subject,
        html,
      }),
    });

    if (!response.ok) {
      console.error("Resend API error:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return false;
  }
}
