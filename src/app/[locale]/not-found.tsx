import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-bold">404</h1>
        <h2 className="text-xl font-semibold">{t("pageNotFound")}</h2>
        <p className="text-muted-foreground">
          {t("pageNotFoundDescription")}
        </p>
        <Button asChild>
          <Link href="/dashboard">{tCommon("backToHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
