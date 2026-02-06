import { auth } from "@/lib/auth";
import { getUserById } from "@/actions/user-actions";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await getUserById(session.user.id);
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Мой профиль</h1>
      <ProfileForm user={user} />
    </div>
  );
}
