import { getSiteLogoUrl } from "@/lib/site-settings";
import { ResetForm } from "./reset-form";

// Логотип берётся из настроек сайта, как на странице входа и на лендинге.
export const dynamic = "force-dynamic";

export default async function ForgotPassword() {
  const logoUrl = await getSiteLogoUrl();
  return <ResetForm logoUrl={logoUrl} />;
}
