import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HomeworkPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  if (session.user.role === "STUDENT") {
    redirect("/homework/student");
  } else {
    redirect("/homework/review");
  }
}
