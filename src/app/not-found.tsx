import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 px-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-bold">404</h1>
        <h2 className="text-xl font-semibold">Страница не найдена</h2>
        <p className="text-muted-foreground">
          Запрашиваемая страница не существует или была удалена.
        </p>
        <Button asChild>
          <Link href="/dashboard">Вернуться на главную</Link>
        </Button>
      </div>
    </div>
  );
}
