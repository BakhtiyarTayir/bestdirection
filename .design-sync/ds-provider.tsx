// design-sync preview provider: components like DatePicker call
// useTranslations() and need a NextIntlClientProvider from the SAME next-intl
// instance that's inlined into the DS bundle — so this ships via extraEntries.
import { NextIntlClientProvider } from "next-intl";
import messages from "../src/i18n/messages/ru.json";

export function DsIntlProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" timeZone="Asia/Tashkent" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
