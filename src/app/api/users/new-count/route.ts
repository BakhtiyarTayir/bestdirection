import { NextResponse } from "next/server";
import { getNewUsersCount } from "@/lib/api/users.server";

// Бейдж «Пользователи» в сайдбаре опрашивает этот роут из браузера; считает api.
export async function GET() {
  const result = await getNewUsersCount();
  if (!result.success) {
    return NextResponse.json({ count: 0 });
  }
  return NextResponse.json(result.data);
}
