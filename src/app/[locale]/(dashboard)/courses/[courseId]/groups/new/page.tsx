import { requireAuth } from "@/lib/auth-guard";
import { GroupForm } from "@/components/groups/group-form";
import { useTranslations } from "next-intl";

interface NewGroupPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function NewGroupPage({ params }: NewGroupPageProps) {
  const t = useTranslations("groups");
  const { courseId } = await params;
  await requireAuth();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("createGroup")}</h1>
      <GroupForm courseId={courseId} />
    </div>
  );
}
