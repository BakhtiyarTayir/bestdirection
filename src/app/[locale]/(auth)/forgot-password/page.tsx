"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  requestPasswordReset,
  verifyEmailCode,
  resetPassword,
} from "@/actions/email-verification-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/language-switcher";

type Step = "email" | "code" | "password";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tValidation = useTranslations("validation");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
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
      case "userNotFound":
        return t("userNotFound");
      case "invalidCode":
        return t("invalidCode");
      case "codeExpired":
        return t("codeExpired");
      case "tooManyAttempts":
        return t("tooManyAttempts");
      case "emailSendFailed":
      case "emailNotConfigured":
        return t("emailSendFailed");
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

    const result = await requestPasswordReset({ email, locale });
    if (!result.success && result.error !== "resendCooldown") {
      setError(errorText(result.error));
      setLoading(false);
      return;
    }

    setCode("");
    setStep("code");
    setResendTimer(60);
    setLoading(false);
  }

  async function onResend() {
    if (resendTimer > 0) return;
    setError(null);
    const result = await requestPasswordReset({ email, locale });
    if (!result.success && result.error !== "resendCooldown") {
      setError(errorText(result.error));
      return;
    }
    setResendTimer(60);
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await verifyEmailCode({ email, code: code.trim() });
    if (!result.success) {
      setError(errorText(result.error));
      setLoading(false);
      return;
    }

    setStep("password");
    setLoading(false);
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

    const result = await resetPassword({
      email,
      code: code.trim(),
      newPassword: password,
    });
    if (!result.success) {
      setError(errorText(result.error));
      setLoading(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (signInResult?.error) {
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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border bg-white">
            <Image src="/logo.png" alt="" width={490} height={492} className="h-8 w-auto" />
          </div>
          <CardTitle className="text-2xl">{t("resetPasswordTitle")}</CardTitle>
          <CardDescription>{t("resetPasswordSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <form onSubmit={onSendCode} className="space-y-4">
              {errorBox}
              <div className="space-y-2">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? t("sendingCode") : t("sendCode")}
              </Button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={onVerifyCode} className="space-y-4">
              {errorBox}
              <p className="text-sm text-muted-foreground">
                {t("codeSentTo", { email })}
              </p>
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
              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.length !== 6}
              >
                {loading ? t("verifyingCode") : t("verifyCode")}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => {
                    setStep("email");
                    setError(null);
                  }}
                >
                  {t("changeEmail")}
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                  disabled={resendTimer > 0}
                  onClick={onResend}
                >
                  {resendTimer > 0
                    ? t("resendCodeIn", { seconds: resendTimer })
                    : t("resendCode")}
                </button>
              </div>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={onResetPassword} className="space-y-4">
              {errorBox}
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("resettingPassword") : t("resetPasswordButton")}
              </Button>
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
