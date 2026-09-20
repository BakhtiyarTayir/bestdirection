import { getSession } from "@/lib/session";

interface WithAuthOptions {
  roles?: string[];
}

type AuthSession = { user: { id: string; role: string; email?: string; name?: string | null } };

type ActionError = { success: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withAuth<T extends { success: true; [key: string]: any }>(
  callback: (session: AuthSession) => Promise<T | ActionError>,
  options?: WithAuthOptions
): Promise<T | ActionError> {
  try {
    const session = await getSession();
    if (!session?.user) {
      return { success: false, error: "unauthorized" };
    }

    if (options?.roles && !options.roles.includes(session.user.role)) {
      return { success: false, error: "forbidden" };
    }

    return await callback(session as AuthSession);
  } catch (error) {
    console.error("Action error:", error);
    return { success: false, error: "somethingWentWrong" };
  }
}
