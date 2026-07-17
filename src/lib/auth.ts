import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import {
  findOrCreateTelegramUser,
  verifyTelegramWidgetPayload,
} from "./telegram/login";

const WIDGET_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
] as const;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
        };
      },
    }),
    // Вход/регистрация через Telegram Login Widget: полезная нагрузка виджета
    // подписана ботом, подпись проверяется на сервере.
    Credentials({
      id: "telegram-widget",
      credentials: {
        id: { type: "text" },
        first_name: { type: "text" },
        last_name: { type: "text" },
        username: { type: "text" },
        photo_url: { type: "text" },
        auth_date: { type: "text" },
        hash: { type: "text" },
      },
      async authorize(credentials) {
        const payload: Record<string, string | undefined> = {};
        for (const field of WIDGET_FIELDS) {
          const value = credentials?.[field];
          if (typeof value === "string" && value !== "") {
            payload[field] = value;
          }
        }

        if (!verifyTelegramWidgetPayload(payload)) return null;

        const user = await findOrCreateTelegramUser({
          telegramId: payload.id!,
          firstName: payload.first_name,
          lastName: payload.last_name,
          username: payload.username,
        });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
        };
      },
    }),
    // Вход/регистрация через Telegram-бота: одноразовый код подтверждается
    // в чате с ботом (см. TelegramAuthRequest и /start login_<code>).
    Credentials({
      id: "telegram-code",
      credentials: { code: { type: "text" } },
      async authorize(credentials) {
        const code = credentials?.code;
        if (typeof code !== "string" || !code) return null;

        // Одноразовость: удаляем заявку атомарно, вход возможен только раз.
        const request = await prisma.telegramAuthRequest
          .delete({ where: { code } })
          .catch(() => null);

        if (
          !request ||
          request.status !== "CONFIRMED" ||
          !request.telegramChatId ||
          request.expiresAt < new Date()
        ) {
          return null;
        }

        const user = await findOrCreateTelegramUser({
          telegramId: request.telegramChatId,
          firstName: request.firstName,
          lastName: request.lastName,
          username: request.telegramUsername,
        });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
