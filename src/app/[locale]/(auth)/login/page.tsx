"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
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
import { LanguageSwitcher } from "@/components/language-switcher";
import { TelegramAuth } from "@/components/telegram-auth";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

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

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
      callbackUrl: safeCallbackUrl,
    });

    if (result?.error) {
      setError(t("invalidCredentials"));
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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border bg-white">
            <Image src="/logo.png" alt="" width={490} height={492} className="h-8 w-auto" />
          </div>
          <CardTitle className="text-2xl">{t("loginTitle")}</CardTitle>
          <CardDescription>{t("loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TelegramAuth />
          {!showEmailForm && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setShowEmailForm(true)}
            >
              {t("loginWithEmail")}
            </Button>
          )}
          {showEmailForm && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("loggingIn") : t("login")}
            </Button>
          </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link href="/register" className="text-primary hover:underline">
              {t("register")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
