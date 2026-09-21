"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  loginWithPassword,
  requestTelegramPasswordReset,
  resetPasswordViaTelegram,
} from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/language-switcher";

type Step = "login" | "reset";

// Сброс пароля идёт через Telegram, а не через почту (шаг 1 отказа от почты,
// PLAN-SALARY-PROFILE-BRANCH-2026-09-20.md, 4.1): вводится ЛОГИН, код приходит
// в чат с ботом. Сервер отвечает одинаково на существующий и несуществующий
// логин (аудит 2.12) — поэтому шаг «код» неотличим от «мы точно его отправили»,
// и это осознанно: иначе форма превращается в перебор логинов.
export default function ForgotPasswordPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tValidation = useTranslations("validation");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("login");
  const [login, setLogin] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  function errorText(errorCode?: string): string {
    switch (errorCode) {
      case "invalidCode":
        return t("invalidCode");
      case "codeExpired":
        return t("codeExpired");
      case "tooManyAttempts":
        return t("tooManyAttempts");
      case "tooManyRequests":
        return t("tooManyRequests");
      default:
        return t("resetFailed");
    }
  }

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Ответ всегда { ok: true } — по нему нельзя понять, существует ли логин
    // и привязан ли к нему Telegram (аудит 2.12)
    await requestTelegramPasswordReset(login);

    setCode("");
    setStep("reset");
    setResendTimer(60);
    setLoading(false);
  }

  async function onResend() {
    if (resendTimer > 0) return;
    setError(null);
    await requestTelegramPasswordReset(login);
    setResendTimer(60);
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(tValidation("passwordMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(tValidation("passwordMismatch"));
      return;
    }

    setLoading(true);

    const result = await resetPasswordViaTelegram({
      login,
      code: code.trim(),
      newPassword: password,
    });
    if (!result.success) {
      setError(errorText(result.error));
      setLoading(false);
      return;
    }

    // Сброс пароля обрывает все сессии, поэтому входим заново
    const signInResult = await loginWithPassword(login, password);

    if (!signInResult.success) {
      router.push("/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  const errorBox = error && (
    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {error}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Image
            src="/marketing/logo.png"
            alt=""
            width={877}
            height={490}
            className="mx-auto mb-4 h-20 w-auto"
          />
          <CardTitle className="text-2xl">{t("resetPasswordTitle")}</CardTitle>
          <CardDescription>{t("resetPasswordSubtitleTelegram")}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "login" && (
            <form onSubmit={onSendCode} className="space-y-4">
              {errorBox}
              <div className="space-y-2">
                <Label htmlFor="login">{t("loginFieldLabel")}</Label>
                <Input
                  id="login"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder="ivan.ivanov"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !login}>
                {loading ? t("sendingCode") : t("sendCodeTelegram")}
              </Button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={onResetPassword} className="space-y-4">
              {errorBox}
              <p className="text-sm text-muted-foreground">{t("codeSentToTelegramLogin", { login })}</p>
              <div className="space-y-2">
                <Label htmlFor="verification-code">{t("verificationCode")}</Label>
                <Input
                  id="verification-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("newPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">{t("confirmPassword")}</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  placeholder={t("confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                {loading ? t("resettingPassword") : t("resetPasswordButton")}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setStep("login");
                    setError(null);
                  }}
                >
                  {t("changeLogin")}
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  disabled={resendTimer > 0}
                  onClick={onResend}
                >
                  {resendTimer > 0 ? t("resendCodeIn", { seconds: resendTimer }) : t("resendCode")}
                </button>
              </div>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              {t("backToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
