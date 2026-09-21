import { getSiteLogoUrl } from "@/lib/site-settings";
import { LoginForm } from "./login-form";

// Логотип спрашивается на сервере и передаётся в форму: он лежит в настройках
// сайта (его загружает администратор), а не файлом в репозитории. Раньше
// страница входа показывала файл из public и расходилась с лендингом.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const logoUrl = await getSiteLogoUrl();
  return <LoginForm logoUrl={logoUrl} />;
}
