import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { locales, defaultLocale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!hasLocale(locales, locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    timeZone: 'Asia/Tashkent',
    // Единая точка отсчёта для относительного времени («5 daqiqa oldin»).
    // Без неё сервер и клиент считают «сейчас» каждый по-своему и React
    // ругается на расхождение при гидратации.
    now: new Date(),
  };
});
