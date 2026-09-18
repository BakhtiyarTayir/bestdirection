"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { updateProfile, changePassword } from "@/lib/api/users";
import { profileSchema, changePasswordSchema, type ProfileInput, type ChangePasswordInput } from "@/validators/profile";
import { Loader2 } from "lucide-react";

interface ProfileUser {
  id: string;
  // У аккаунтов, созданных через Telegram, почты нет
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
}

interface ProfileFormProps {
  user: ProfileUser;
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("profile");
  const tErrors = useTranslations("errors");
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? "",
    },
  });

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const handleProfileSubmit = async (data: ProfileInput) => {
    setIsProfileLoading(true);
    try {
      const result = await updateProfile(data);
      if (result.success) {
        toast({
          title: t("profileUpdated"),
          description: t("profileUpdatedDescription"),
        });
        router.refresh();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("profileUpdateFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (data: ChangePasswordInput) => {
    setIsPasswordLoading(true);
    try {
      const result = await changePassword(data);
      if (result.success) {
        toast({
          title: t("passwordChanged"),
          description: t("passwordChangedDescription"),
        });
        passwordForm.reset();
      } else {
        toast({
          title: tErrors("error"),
          description: result.error ?? t("passwordChangeFailed"),
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: tErrors("error"),
        description: tErrors("unexpected"),
        variant: "destructive",
      });
    } finally {
      setIsPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("personalData")}</CardTitle>
          <CardDescription>
            {t("personalDataDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={profileForm.handleSubmit(handleProfileSubmit)}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">{t("firstName")}</Label>
                <Input
                  id="firstName"
                  placeholder={t("firstNamePlaceholder")}
                  {...profileForm.register("firstName")}
                />
                {profileForm.formState.errors.firstName && (
                  <p className="text-sm text-destructive">
                    {profileForm.formState.errors.firstName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName">{t("lastName")}</Label>
                <Input
                  id="lastName"
                  placeholder={t("lastNamePlaceholder")}
                  {...profileForm.register("lastName")}
                />
                {profileForm.formState.errors.lastName && (
                  <p className="text-sm text-destructive">
                    {profileForm.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                value={user.email ?? ""}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                {t("emailNote")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                placeholder={t("phonePlaceholder")}
                {...profileForm.register("phone")}
              />
              {profileForm.formState.errors.phone && (
                <p className="text-sm text-destructive">
                  {profileForm.formState.errors.phone.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isProfileLoading}>
              {isProfileLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("saveChanges")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("changePassword")}</CardTitle>
          <CardDescription>
            {t("changePasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                placeholder={t("currentPasswordPlaceholder")}
                {...passwordForm.register("currentPassword")}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder={t("newPasswordPlaceholder")}
                {...passwordForm.register("newPassword")}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder={t("confirmPasswordPlaceholder")}
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" disabled={isPasswordLoading}>
              {isPasswordLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("changePasswordButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
