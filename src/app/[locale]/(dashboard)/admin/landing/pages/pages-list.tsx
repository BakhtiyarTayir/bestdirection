"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { deleteMarketingItem } from "@/lib/api/marketing";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

interface PageListRow {
  id: string;
  slug: string;
  titleRu: string;
  titleUz: string;
  published: boolean;
  showInFooter: boolean;
  sortOrder: number;
}

export function PagesList({ rows }: { rows: PageListRow[] }) {
  const t = useTranslations("landingAdmin");
  const { toast } = useToast();
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeletingId(id);
    const result = await deleteMarketingItem("pages", id);
    if (result.success) {
      toast({ description: t("deleted") });
      router.refresh();
    } else {
      toast({ variant: "destructive", description: t("error") });
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <Button asChild>
        <Link href="/admin/landing/pages/new">
          <Plus className="mr-2 h-4 w-4" />
          {t("pageAdd")}
        </Link>
      </Button>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pagesEmpty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pageTitleColumn")}</TableHead>
              <TableHead>{t("pageSlugColumn")}</TableHead>
              <TableHead>{t("sortOrderField")}</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/landing/pages/${row.id}`} className="hover:underline">
                    {row.titleRu}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">/{row.slug}</TableCell>
                <TableCell>{row.sortOrder}</TableCell>
                <TableCell>
                  {!row.published && <Badge variant="secondary">{t("pageDraftBadge")}</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/landing/pages/${row.id}`} aria-label={t("save")}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deletingId === row.id}
                      onClick={() => {
                        if (window.confirm(t("confirmDelete"))) remove(row.id);
                      }}
                      aria-label={t("delete")}
                    >
                      {deletingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
