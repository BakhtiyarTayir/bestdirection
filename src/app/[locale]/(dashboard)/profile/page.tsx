import { auth } from "@/lib/auth";
import { getUserById } from "@/actions/user-actions";
import { redirect } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ProfileForm } from "./profile-form";
import { TelegramLink } from "@/components/telegram-link";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const result = await getUserById(session.user.id);
  if (!result.success || !result.data) redirect("/login");
  const user = result.data;

  return <ProfilePageContent user={user} />;
}

function ProfilePageContent({ user }: { user: { id: string; email: string; firstName: string; lastName: string; phone: string | null } }) {
  const t = useTranslations("profile");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <ProfileForm user={user} />
      <TelegramLink />
    </div>
  );
}
