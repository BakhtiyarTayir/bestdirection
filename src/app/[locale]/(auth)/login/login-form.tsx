"use client";

import { useState } from "react";
import { loginWithPassword } from "@/lib/api/auth";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/validators/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { DEFAULT_MARKETING_LOGO_URL } from "@/lib/site-settings";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TelegramAuth } from "@/components/telegram-auth";

export function LoginForm({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const t = useTranslations("auth");
  const tValidation = useTranslations("validation");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const normalizeForLocalizedRouter = (path: string) => {
    const localePrefix = `/${locale}`;
    if (path === localePrefix) return "/";
    if (path.startsWith(`${localePrefix}/`)) return path.slice(localePrefix.length);
    return path;
  };

  async function onSubmit(data: LoginInput) {
    setLoading(true);
    setError(null);

    const callbackUrlParam = new URLSearchParams(window.location.search).get("callbackUrl");
    const safeCallbackUrlRaw =
      callbackUrlParam && callbackUrlParam.startsWith("/") && !callbackUrlParam.startsWith("//")
        ? callbackUrlParam
        : "/dashboard";
    const safeCallbackUrl = normalizeForLocalizedRouter(safeCallbackUrlRaw);

    const result = await loginWithPassword(data.login, data.password);

    if (!result.success) {
      // api отвечает одинаково на неверный пароль и неизвестный логин —
      // иначе форма превращается в перебор логинов
      setError(
        result.error === "tooManyRequests"
          ? t("tooManyLoginAttempts")
          : t("invalidCredentials")
      );
      setLoading(false);
      return;
    }

    router.push(safeCallbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {/* Логотип центра, как на публичном сайте: широкий, поэтому без
              круглой рамки — в ней он сжимался до нечитаемого значка */}
          <Image
            src={logoUrl || DEFAULT_MARKETING_LOGO_URL}
            alt=""
            width={877}
            height={490}
            priority
            className="mx-auto mb-4 h-28 w-auto"
          />
          <CardTitle className="text-2xl">{t("loginTitle")}</CardTitle>
          <CardDescription>{t("loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Логин с паролем — основной способ: им заходят все ученики.
              Telegram остаётся запасным и стоит под формой */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="login">{t("loginFieldLabel")}</Label>
              <Input
                id="login"
                type="text"
                autoComplete="username"
                placeholder="ivan.ivanov"
                {...register("login")}
              />
              {errors.login && (
                <p className="text-sm text-destructive">{tValidation(errors.login.message ?? "required")}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("password")}</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{tValidation(errors.password.message ?? "required")}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("loggingIn") : t("login")}
            </Button>
          </form>
          <TelegramAuth compact />
        </CardContent>
      </Card>
    </div>
  );
}
