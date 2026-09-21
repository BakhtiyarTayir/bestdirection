import { DEFAULT_MARKETING_LOGO_URL, getSiteLogoUrl } from "@/lib/site-settings";
import { ResetForm } from "./reset-form";

// Логотип берётся из настроек сайта, как на странице входа и на лендинге.
export const dynamic = "force-dynamic";

export default async function ForgotPassword() {
  // Запасной путь подставляет сервер: site-settings тянет серверный код,
  // и клиентскому компоненту его импортировать нельзя — сборка падает
  const logoUrl = (await getSiteLogoUrl()) ?? DEFAULT_MARKETING_LOGO_URL;
  return <ResetForm logoUrl={logoUrl} />;
}
