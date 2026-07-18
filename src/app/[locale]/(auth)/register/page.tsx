"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  registerDetailsSchema,
  type RegisterDetailsInput,
} from "@/validators/auth";
import { registerUser } from "@/actions/auth-actions";
import {
  requestEmailVerification,
  verifyEmailCode,
} from "@/actions/email-verification-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TelegramAuth } from "@/components/telegram-auth";

type Step = "email" | "code" | "details";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tValidation = useTranslations("validation");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterDetailsInput>({
    resolver: zodResolver(registerDetailsSchema),
  });

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setTimeout(() => setResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendTimer]);

  function verificationErrorText(errorCode?: string): string {
    switch (errorCode) {
      case "emailAlreadyExists":
        return t("emailAlreadyExists");
      case "invalidCode":
        return t("invalidCode");
      case "codeExpired":
        return t("codeExpired");
      case "tooManyAttempts":
        return t("tooManyAttempts");
      case "emailSendFailed":
      case "emailNotConfigured":
        return t("emailSendFailed");
      default:
        return t("registerError");
    }
  }

  // Шаг 1: отправить код на почту
  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await requestEmailVerification({ email, locale });

    // resendCooldown: недавно отправленный код ещё действует — идём к вводу
    if (!result.success && result.error !== "resendCooldown") {
      setError(verificationErrorText(result.error));
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
    const result = await requestEmailVerification({ email, locale });
    if (!result.success && result.error !== "resendCooldown") {
      setError(verificationErrorText(result.error));
      return;
    }
    setResendTimer(60);
  }

  // Шаг 2: проверить код
  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await verifyEmailCode({ email, code: code.trim() });
    if (!result.success) {
      setError(verificationErrorText(result.error));
      setLoading(false);
      return;
    }

    setStep("details");
    setLoading(false);
  }

  // Шаг 3: создать аккаунт
  async function onSubmitDetails(data: RegisterDetailsInput) {
    setLoading(true);
    setError(null);

    const result = await registerUser({
      firstName: data.firstName,
      lastName: data.lastName,
      email,
      password: data.password,
      code: code.trim(),
    });

    if (!result.success) {
      setError(verificationErrorText(result.error));
      setLoading(false);
      return;
    }

    const signInResult = await signIn("credentials", {
      email,
      password: data.password,
      redirect: false,
      callbackUrl: `/${locale}/dashboard`,
    });

    if (signInResult?.error) {
      setError(t("registerSuccessLoginFailed"));
      setLoading(false);
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
          <CardTitle className="text-2xl">{t("registerTitle")}</CardTitle>
          <CardDescription>{t("registerSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" && (
            <>
              <TelegramAuth />
              {!showEmailForm && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setShowEmailForm(true)}
                >
                  {t("registerWithEmail")}
                </Button>
              )}
              {showEmailForm && (
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
            </>
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

          {step === "details" && (
            <form onSubmit={handleSubmit(onSubmitDetails)} className="space-y-4">
              {errorBox}
              <p className="text-sm text-muted-foreground">
                {t("emailConfirmed", { email })}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("firstName")}</Label>
                  <Input
                    id="firstName"
                    placeholder={t("firstNamePlaceholder")}
                    {...register("firstName")}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-destructive">{tValidation(errors.firstName.message ?? "required")}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("lastName")}</Label>
                  <Input
                    id="lastName"
                    placeholder={t("lastNamePlaceholder")}
                    {...register("lastName")}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-destructive">{tValidation(errors.lastName.message ?? "required")}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-sm text-destructive">{tValidation(errors.password.message ?? "required")}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t("confirmPasswordPlaceholder")}
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{tValidation(errors.confirmPassword.message ?? "required")}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("registering") : t("register")}
              </Button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
