import { decode } from "@auth/core/jwt";

// Сессией пока владеет web (NextAuth v5, JWT-стратегия). Кука — JWE,
// зашифрованный ключом из AUTH_SECRET, солью служит имя куки. По HTTPS имя с
// префиксом __Secure-. Длинную куку Auth.js режет на части name.0, name.1, ...
export const SESSION_COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;

export interface SessionTokenPayload {
  /** id пользователя: кладёт jwt-callback в src/lib/auth.ts */
  id?: string;
  sub?: string;
}

function readCookieValue(cookies: Record<string, string>, name: string): string | undefined {
  if (cookies[name]) return cookies[name];

  const chunks = Object.keys(cookies)
    .filter((key) => key.startsWith(`${name}.`) && /^\d+$/.test(key.slice(name.length + 1)))
    .sort((a, b) => Number(a.slice(name.length + 1)) - Number(b.slice(name.length + 1)));
  if (chunks.length === 0) return undefined;
  return chunks.map((key) => cookies[key]).join("");
}

/**
 * id пользователя из сессионной куки или null. Роль из токена намеренно не
 * возвращается: она записана при входе и могла устареть, её берём из БД.
 */
export async function readSessionUserId(
  cookies: Record<string, string> | undefined,
  secret: string
): Promise<string | null> {
  if (!cookies) return null;

  for (const name of SESSION_COOKIE_NAMES) {
    const token = readCookieValue(cookies, name);
    if (!token) continue;
    try {
      const payload = (await decode({ token, secret, salt: name })) as SessionTokenPayload | null;
      const userId = payload?.id ?? payload?.sub;
      if (typeof userId === "string" && userId) return userId;
    } catch {
      // Битая, чужая или просроченная кука — то же, что её отсутствие
    }
  }
  return null;
}
