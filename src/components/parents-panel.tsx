"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  createParentForStudent,
  getStudentParents,
  linkParent,
  searchParentCandidates,
  unlinkParent,
  updateParentLink,
} from "@/lib/api/attendance";
import type { ParentRelation } from "@/validators/parent";
import { Loader2, Phone, Star, Trash2, UserPlus, Search } from "lucide-react";

const RELATIONS: ParentRelation[] = ["MOTHER", "FATHER", "GUARDIAN", "OTHER"];

interface ParentLink {
  id: string;
  relation: ParentRelation;
  isPrimary: boolean;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    isActive: boolean;
  };
}

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  _count: { childLinks: number };
}

export function ParentsPanel({ studentId }: { studentId: string }) {
  const t = useTranslations("parents");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const { toast } = useToast();

  const [links, setLinks] = useState<ParentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  // Создание нового родителя
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState<ParentRelation>("OTHER");
  const [isPrimary, setIsPrimary] = useState(false);

  // Привязка уже заведённого
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const reload = async () => {
    const res = await getStudentParents(studentId);
    if (res.success) setLinks(res.data as ParentLink[]);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Поиск с задержкой: иначе запрос на каждую букву
  useEffect(() => {
    if (query.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await searchParentCandidates(query);
      if (res.success) setCandidates(res.data as Candidate[]);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const report = (res: { success: boolean; error?: string }, okKey: string) => {
    if (res.success) {
      toast({ title: t(okKey) });
      void reload();
    } else {
      toast({ variant: "destructive", title: tErrors(res.error ?? "somethingWentWrong") });
    }
  };

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createParentForStudent({
        studentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        relation,
        isPrimary,
      });
      if (res.success) {
        setFirstName("");
        setLastName("");
        setPhone("");
        setRelation("OTHER");
        setIsPrimary(false);
      }
      report(res, "parentAdded");
    });
  };

  const handleLink = (parentId: string) => {
    startTransition(async () => {
      const res = await linkParent({ parentId, studentId, relation: "OTHER", isPrimary: false });
      if (res.success) {
        setQuery("");
        setCandidates([]);
      }
      report(res, "parentLinked");
    });
  };

  const handleRelation = (id: string, value: ParentRelation) => {
    startTransition(async () => report(await updateParentLink(id, { relation: value }), "saved"));
  };

  const handlePrimary = (id: string) => {
    startTransition(async () => report(await updateParentLink(id, { isPrimary: true }), "saved"));
  };

  const handleUnlink = (id: string) => {
    startTransition(async () => report(await unlinkParent(id), "parentUnlinked"));
  };

  const canCreate = firstName.trim() && lastName.trim() && phone.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ─── Привязанные родители ─── */}
        {loading ? (
          <p className="text-sm text-muted-foreground">{tCommon("loading")}</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {link.parent.lastName} {link.parent.firstName}
                    {link.isPrimary && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        {t("primary")}
                      </Badge>
                    )}
                  </div>
                  {link.parent.phone ? (
                    <a
                      href={`tel:${link.parent.phone.replace(/[^+\d]/g, "")}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                      <Phone className="h-3 w-3" aria-hidden="true" />
                      {link.parent.phone}
                    </a>
                  ) : (
                    <span className="mt-0.5 block text-sm text-destructive">{t("noPhone")}</span>
                  )}
                </div>

                <Select
                  value={link.relation}
                  onValueChange={(v) => handleRelation(link.id, v as ParentRelation)}
                  disabled={pending}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`relation.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {!link.isPrimary && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || !link.parent.phone}
                    onClick={() => handlePrimary(link.id)}
                    title={link.parent.phone ? undefined : t("noPhoneCannotBePrimary")}
                  >
                    {t("makePrimary")}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleUnlink(link.id)}
                  aria-label={t("unlink")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* ─── Новый родитель ─── */}
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("addNew")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-last">{t("lastName")}</Label>
              <Input id="p-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-first">{t("firstName")}</Label>
              <Input id="p-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-phone">{t("phone")}</Label>
              <Input
                id="p-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
              />
              <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-relation">{t("relationLabel")}</Label>
              <Select value={relation} onValueChange={(v) => setRelation(v as ParentRelation)}>
                <SelectTrigger id="p-relation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`relation.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="p-primary" checked={isPrimary} onCheckedChange={setIsPrimary} />
            <Label htmlFor="p-primary" className="font-normal">
              {t("primaryHint")}
            </Label>
          </div>
          <Button type="button" onClick={handleCreate} disabled={pending || !canCreate}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("addNew")}
          </Button>
        </div>

        {/* ─── Привязать существующего ─── */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("linkExisting")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("linkExistingHint")}</p>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
          {candidates.length > 0 && (
            <ul className="divide-y rounded-md border">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="font-medium">
                      {c.lastName} {c.firstName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {c.phone ?? t("noPhone")} · {t("childrenCount", { count: c._count.childLinks })}
                    </div>
                  </div>
                  <Button type="button" size="sm" disabled={pending} onClick={() => handleLink(c.id)}>
                    {t("link")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
