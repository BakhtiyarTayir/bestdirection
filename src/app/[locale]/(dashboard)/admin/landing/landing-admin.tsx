"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import {
  saveMarketingCourse,
  deleteMarketingCourse,
  saveMarketingReel,
  deleteMarketingReel,
  saveMarketingGalleryItem,
  deleteMarketingGalleryItem,
  saveMarketingTestimonial,
  deleteMarketingTestimonial,
  saveMarketingTexts,
  seedMarketingContent,
} from "@/actions/marketing-content-actions";
import { Loader2, Pencil, Plus, Trash2, Upload, DownloadCloud } from "lucide-react";

// Типы = сериализованные строки Prisma-таблиц
interface CourseRow {
  id: string;
  slug: string;
  title: string;
  summaryRu: string | null;
  summaryUz: string | null;
  cover: string | null;
  price: number | null;
  intakeStartDate: Date | null;
  intakeSeats: number | null;
  intakeNoteRu: string | null;
  intakeNoteUz: string | null;
  sortOrder: number;
  published: boolean;
}

interface ReelRow {
  id: string;
  url: string;
  sortOrder: number;
  published: boolean;
}

interface GalleryRow {
  id: string;
  image: string;
  titleRu: string;
  titleUz: string;
  textRu: string;
  textUz: string;
  sortOrder: number;
  published: boolean;
}

interface TestimonialRow {
  id: string;
  quoteRu: string;
  quoteUz: string;
  author: string;
  roleRu: string;
  roleUz: string;
  sortOrder: number;
  published: boolean;
}

interface TextRow {
  key: string;
  ru: string;
  uz: string;
}

interface LandingAdminProps {
  courses: CourseRow[];
  reels: ReelRow[];
  gallery: GalleryRow[];
  testimonials: TestimonialRow[];
  texts: TextRow[];
  initialTab?: string;
}

// Вкладки повторяют порядок секций на самом лендинге (сверху вниз).
// Каждой вкладке соответствуют префиксы ключей MarketingText её секции.
const TAB_TEXT_PREFIXES: Record<string, string[]> = {
  menu: ["header.", "meta."],
  hero: ["hero.", "stats."],
  how: ["how."],
  courses: ["courses."],
  robotics: ["gallery."],
  instagram: ["instagram."],
  testimonials: ["testimonials."],
  apply: ["cta.", "leadForm."],
  footer: ["footer."],
};

const TAB_ORDER = [
  "menu",
  "hero",
  "how",
  "courses",
  "robotics",
  "instagram",
  "testimonials",
  "apply",
  "footer",
] as const;

type ActionResult = { success: true } | { success: false; error: string };

export function LandingAdmin({ courses, reels, gallery, testimonials, texts, initialTab }: LandingAdminProps) {
  const t = useTranslations("landingAdmin");
  const { toast } = useToast();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);

  const notify = (result: ActionResult, okMessage = t("saved")) => {
    if (result.success) {
      toast({ description: okMessage });
      router.refresh();
    } else {
      const known = ["invalidInput", "slugTaken"];
      toast({
        variant: "destructive",
        description: known.includes(result.error) ? t(result.error as "invalidInput") : t("error"),
      });
    }
    return result.success;
  };

  const allEmpty =
    courses.length === 0 &&
    reels.length === 0 &&
    gallery.length === 0 &&
    testimonials.length === 0 &&
    texts.length === 0;

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedMarketingContent();
      if (result.success) {
        toast({
          description:
            result.seeded.length > 0
              ? t("seedDone", { count: result.seeded.length })
              : t("seedNothing"),
        });
        router.refresh();
      } else {
        toast({ variant: "destructive", description: t("error") });
      }
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Кнопка импорта нужна только при первом запуске — когда контент уже
          в БД, контент-менеджеру она ни к чему */}
      {allEmpty && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={handleSeed} disabled={seeding}>
            {seeding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DownloadCloud className="mr-2 h-4 w-4" />
            )}
            {t("seedButton")}
          </Button>
          <p className="text-sm text-muted-foreground">{t("emptyGeneric")}</p>
        </div>
      )}

      <Tabs
        defaultValue={TAB_ORDER.includes(initialTab as (typeof TAB_ORDER)[number]) ? initialTab : "menu"}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="menu">{t("tabMenu")}</TabsTrigger>
          <TabsTrigger value="hero">{t("tabHero")}</TabsTrigger>
          <TabsTrigger value="how">{t("tabHow")}</TabsTrigger>
          <TabsTrigger value="courses">{t("tabCourses")}</TabsTrigger>
          <TabsTrigger value="robotics">{t("tabRobotics")}</TabsTrigger>
          <TabsTrigger value="instagram">{t("tabInstagram")}</TabsTrigger>
          <TabsTrigger value="testimonials">{t("tabTestimonials")}</TabsTrigger>
          <TabsTrigger value="apply">{t("tabApply")}</TabsTrigger>
          <TabsTrigger value="footer">{t("tabFooter")}</TabsTrigger>
        </TabsList>

        <TabsContent value="menu">
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.menu} />
        </TabsContent>
        <TabsContent value="hero">
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.hero} />
        </TabsContent>
        <TabsContent value="how">
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.how} />
        </TabsContent>
        <TabsContent value="courses" className="space-y-8">
          <CoursesTab rows={courses} notify={notify} />
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.courses} withHeading />
        </TabsContent>
        <TabsContent value="robotics" className="space-y-8">
          <GalleryTab rows={gallery} notify={notify} />
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.robotics} withHeading />
        </TabsContent>
        <TabsContent value="instagram" className="space-y-8">
          <ReelsTab rows={reels} notify={notify} />
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.instagram} withHeading />
        </TabsContent>
        <TabsContent value="testimonials" className="space-y-8">
          <TestimonialsTab rows={testimonials} notify={notify} />
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.testimonials} withHeading />
        </TabsContent>
        <TabsContent value="apply">
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.apply} />
        </TabsContent>
        <TabsContent value="footer">
          <SectionTexts rows={texts} notify={notify} prefixes={TAB_TEXT_PREFIXES.footer} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Notify = (result: ActionResult, okMessage?: string) => boolean;

// ─── Общие мелкие блоки ──────────────────────────────────────────────────

function RowActions({
  onEdit,
  onDelete,
  deleting,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const t = useTranslations("landingAdmin");
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={onEdit} aria-label={t("save")}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={deleting}
        onClick={() => {
          if (window.confirm(t("confirmDelete"))) onDelete();
        }}
        aria-label={t("delete")}
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function PublishedBadge({ published }: { published: boolean }) {
  const t = useTranslations("landingAdmin");
  if (published) return null;
  return <Badge variant="secondary">{t("hiddenBadge")}</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CommonFooterFields({
  sortOrder,
  setSortOrder,
  published,
  setPublished,
}: {
  sortOrder: string;
  setSortOrder: (v: string) => void;
  published: boolean;
  setPublished: (v: boolean) => void;
}) {
  const t = useTranslations("landingAdmin");
  return (
    <div className="flex items-end gap-6">
      <Field label={t("sortOrderField")}>
        <Input
          type="number"
          className="w-24"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <Switch checked={published} onCheckedChange={setPublished} />
        {t("publishedField")}
      </label>
    </div>
  );
}

/** Поле изображения: ручной путь + загрузка через /api/v1/upload/image */
function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("landingAdmin");
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/v1/upload/image", { method: "POST", body: formData });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { url: string };
      onChange(data.url);
    } catch {
      toast({ variant: "destructive", description: t("error") });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Field label={t("imagePathLabel")}>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          placeholder={t("imagePathPlaceholder")}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {uploading ? t("uploading") : t("uploadImage")}
        </Button>
      </div>
      {value && (
        <div className="relative mt-2 h-24 w-40 overflow-hidden rounded-md border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
        </div>
      )}
    </Field>
  );
}

// ─── Курсы ───────────────────────────────────────────────────────────────

function CoursesTab({ rows, notify }: { rows: CourseRow[]; notify: Notify }) {
  const numberLocale = intlLocale(useLocale());
  const t = useTranslations("landingAdmin");
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeletingId(id);
    notify(await deleteMarketingCourse(id), t("deleted"));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("add")}
      </Button>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyGeneric")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("courseTitle")}</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>{t("coursePrice")}</TableHead>
              <TableHead>{t("sortOrderField")}</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.title}</TableCell>
                <TableCell className="text-muted-foreground">{row.slug}</TableCell>
                <TableCell>{row.price ? row.price.toLocaleString(numberLocale) : "—"}</TableCell>
                <TableCell>{row.sortOrder}</TableCell>
                <TableCell>
                  <PublishedBadge published={row.published} />
                </TableCell>
                <TableCell>
                  <RowActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => remove(row.id)}
                    deleting={deletingId === row.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {open && (
        <CourseDialog
          key={editing?.id ?? "new"}
          row={editing}
          onClose={() => setOpen(false)}
          notify={notify}
        />
      )}
    </div>
  );
}

function CourseDialog({
  row,
  onClose,
  notify,
}: {
  row: CourseRow | null;
  onClose: () => void;
  notify: Notify;
}) {
  const t = useTranslations("landingAdmin");
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState(row?.slug ?? "");
  const [title, setTitle] = useState(row?.title ?? "");
  const [summaryRu, setSummaryRu] = useState(row?.summaryRu ?? "");
  const [summaryUz, setSummaryUz] = useState(row?.summaryUz ?? "");
  const [cover, setCover] = useState(row?.cover ?? "");
  const [price, setPrice] = useState(row?.price?.toString() ?? "");
  const [intakeDate, setIntakeDate] = useState(
    row?.intakeStartDate ? new Date(row.intakeStartDate).toISOString().slice(0, 10) : ""
  );
  const [intakeSeats, setIntakeSeats] = useState(row?.intakeSeats?.toString() ?? "");
  const [intakeNoteRu, setIntakeNoteRu] = useState(row?.intakeNoteRu ?? "");
  const [intakeNoteUz, setIntakeNoteUz] = useState(row?.intakeNoteUz ?? "");
  const [sortOrder, setSortOrder] = useState((row?.sortOrder ?? 0).toString());
  const [published, setPublished] = useState(row?.published ?? true);

  const submit = async () => {
    setSaving(true);
    const ok = notify(
      await saveMarketingCourse({
        id: row?.id,
        slug: slug.trim(),
        title: title.trim(),
        summaryRu: summaryRu || null,
        summaryUz: summaryUz || null,
        cover: cover || null,
        price: price === "" ? null : Number(price),
        intakeStartDate: intakeDate === "" ? null : new Date(intakeDate),
        intakeSeats: intakeSeats === "" ? null : Number(intakeSeats),
        intakeNoteRu: intakeNoteRu || null,
        intakeNoteUz: intakeNoteUz || null,
        sortOrder: Number(sortOrder) || 0,
        published,
      })
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("courseDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("courseTitle")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("courseSlug")}>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t("courseSummaryRu")}>
              <Textarea rows={3} value={summaryRu} onChange={(e) => setSummaryRu(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={t("courseSummaryUz")}>
              <Textarea rows={3} value={summaryUz} onChange={(e) => setSummaryUz(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <ImageField value={cover} onChange={setCover} />
          </div>
          <Field label={t("coursePrice")}>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label={t("courseIntakeDate")}>
            <Input type="date" value={intakeDate} onChange={(e) => setIntakeDate(e.target.value)} />
          </Field>
          <Field label={t("courseIntakeSeats")}>
            <Input
              type="number"
              value={intakeSeats}
              onChange={(e) => setIntakeSeats(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <Field label={t("courseIntakeNoteRu")}>
              <Input value={intakeNoteRu} onChange={(e) => setIntakeNoteRu(e.target.value)} />
            </Field>
            <Field label={t("courseIntakeNoteUz")}>
              <Input value={intakeNoteUz} onChange={(e) => setIntakeNoteUz(e.target.value)} />
            </Field>
          </div>
          <CommonFooterFields
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            published={published}
            setPublished={setPublished}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !title.trim() || !slug.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Галерея ─────────────────────────────────────────────────────────────

function GalleryTab({ rows, notify }: { rows: GalleryRow[]; notify: Notify }) {
  const t = useTranslations("landingAdmin");
  const [editing, setEditing] = useState<GalleryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeletingId(id);
    notify(await deleteMarketingGalleryItem(id), t("deleted"));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("add")}
      </Button>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyGeneric")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <div key={row.id} className="overflow-hidden rounded-lg border">
              <div className="relative aspect-[4/3] bg-muted">
                <Image src={row.image} alt={row.titleRu} fill className="object-cover" unoptimized />
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{row.titleRu}</p>
                  <PublishedBadge published={row.published} />
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{row.textRu}</p>
                <RowActions
                  onEdit={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                  onDelete={() => remove(row.id)}
                  deleting={deletingId === row.id}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <GalleryDialog
          key={editing?.id ?? "new"}
          row={editing}
          onClose={() => setOpen(false)}
          notify={notify}
        />
      )}
    </div>
  );
}

function GalleryDialog({
  row,
  onClose,
  notify,
}: {
  row: GalleryRow | null;
  onClose: () => void;
  notify: Notify;
}) {
  const t = useTranslations("landingAdmin");
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState(row?.image ?? "");
  const [titleRu, setTitleRu] = useState(row?.titleRu ?? "");
  const [titleUz, setTitleUz] = useState(row?.titleUz ?? "");
  const [textRu, setTextRu] = useState(row?.textRu ?? "");
  const [textUz, setTextUz] = useState(row?.textUz ?? "");
  const [sortOrder, setSortOrder] = useState((row?.sortOrder ?? 0).toString());
  const [published, setPublished] = useState(row?.published ?? true);

  const submit = async () => {
    setSaving(true);
    const ok = notify(
      await saveMarketingGalleryItem({
        id: row?.id,
        image: image.trim(),
        titleRu: titleRu.trim(),
        titleUz: titleUz.trim(),
        textRu: textRu.trim(),
        textUz: textUz.trim(),
        sortOrder: Number(sortOrder) || 0,
        published,
      })
    );
    setSaving(false);
    if (ok) onClose();
  };

  const filled = image.trim() && titleRu.trim() && titleUz.trim() && textRu.trim() && textUz.trim();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("galleryDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <ImageField value={image} onChange={setImage} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("galleryTitleRu")}>
              <Input value={titleRu} onChange={(e) => setTitleRu(e.target.value)} />
            </Field>
            <Field label={t("galleryTitleUz")}>
              <Input value={titleUz} onChange={(e) => setTitleUz(e.target.value)} />
            </Field>
            <Field label={t("galleryTextRu")}>
              <Textarea rows={2} value={textRu} onChange={(e) => setTextRu(e.target.value)} />
            </Field>
            <Field label={t("galleryTextUz")}>
              <Textarea rows={2} value={textUz} onChange={(e) => setTextUz(e.target.value)} />
            </Field>
          </div>
          <CommonFooterFields
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            published={published}
            setPublished={setPublished}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !filled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reels ───────────────────────────────────────────────────────────────

function ReelsTab({ rows, notify }: { rows: ReelRow[]; notify: Notify }) {
  const t = useTranslations("landingAdmin");
  const [editing, setEditing] = useState<ReelRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeletingId(id);
    notify(await deleteMarketingReel(id), t("deleted"));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("add")}
      </Button>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyGeneric")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("reelUrl")}</TableHead>
              <TableHead>{t("sortOrderField")}</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {row.url}
                  </a>
                </TableCell>
                <TableCell>{row.sortOrder}</TableCell>
                <TableCell>
                  <PublishedBadge published={row.published} />
                </TableCell>
                <TableCell>
                  <RowActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => remove(row.id)}
                    deleting={deletingId === row.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {open && (
        <ReelDialog
          key={editing?.id ?? "new"}
          row={editing}
          onClose={() => setOpen(false)}
          notify={notify}
        />
      )}
    </div>
  );
}

function ReelDialog({
  row,
  onClose,
  notify,
}: {
  row: ReelRow | null;
  onClose: () => void;
  notify: Notify;
}) {
  const t = useTranslations("landingAdmin");
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState(row?.url ?? "");
  const [sortOrder, setSortOrder] = useState((row?.sortOrder ?? 0).toString());
  const [published, setPublished] = useState(row?.published ?? true);

  const submit = async () => {
    setSaving(true);
    const ok = notify(
      await saveMarketingReel({
        id: row?.id,
        url: url.trim(),
        sortOrder: Number(sortOrder) || 0,
        published,
      })
    );
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reelDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("reelUrl")}>
            <Input
              value={url}
              placeholder="https://www.instagram.com/p/…"
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">{t("reelUrlHint")}</p>
          <CommonFooterFields
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            published={published}
            setPublished={setPublished}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !url.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Отзывы ──────────────────────────────────────────────────────────────

function TestimonialsTab({ rows, notify }: { rows: TestimonialRow[]; notify: Notify }) {
  const t = useTranslations("landingAdmin");
  const [editing, setEditing] = useState<TestimonialRow | null>(null);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeletingId(id);
    notify(await deleteMarketingTestimonial(id), t("deleted"));
    setDeletingId(null);
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => {
          setEditing(null);
          setOpen(true);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        {t("add")}
      </Button>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("emptyGeneric")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("testimonialAuthor")}</TableHead>
              <TableHead>{t("testimonialQuoteRu")}</TableHead>
              <TableHead>{t("sortOrderField")}</TableHead>
              <TableHead />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.author}</TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">
                  {row.quoteRu}
                </TableCell>
                <TableCell>{row.sortOrder}</TableCell>
                <TableCell>
                  <PublishedBadge published={row.published} />
                </TableCell>
                <TableCell>
                  <RowActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => remove(row.id)}
                    deleting={deletingId === row.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {open && (
        <TestimonialDialog
          key={editing?.id ?? "new"}
          row={editing}
          onClose={() => setOpen(false)}
          notify={notify}
        />
      )}
    </div>
  );
}

function TestimonialDialog({
  row,
  onClose,
  notify,
}: {
  row: TestimonialRow | null;
  onClose: () => void;
  notify: Notify;
}) {
  const t = useTranslations("landingAdmin");
  const [saving, setSaving] = useState(false);
  const [quoteRu, setQuoteRu] = useState(row?.quoteRu ?? "");
  const [quoteUz, setQuoteUz] = useState(row?.quoteUz ?? "");
  const [author, setAuthor] = useState(row?.author ?? "");
  const [roleRu, setRoleRu] = useState(row?.roleRu ?? "");
  const [roleUz, setRoleUz] = useState(row?.roleUz ?? "");
  const [sortOrder, setSortOrder] = useState((row?.sortOrder ?? 0).toString());
  const [published, setPublished] = useState(row?.published ?? true);

  const submit = async () => {
    setSaving(true);
    const ok = notify(
      await saveMarketingTestimonial({
        id: row?.id,
        quoteRu: quoteRu.trim(),
        quoteUz: quoteUz.trim(),
        author: author.trim(),
        roleRu: roleRu.trim(),
        roleUz: roleUz.trim(),
        sortOrder: Number(sortOrder) || 0,
        published,
      })
    );
    setSaving(false);
    if (ok) onClose();
  };

  const filled =
    quoteRu.trim() && quoteUz.trim() && author.trim() && roleRu.trim() && roleUz.trim();

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("testimonialDialogTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={t("testimonialQuoteRu")}>
            <Textarea rows={3} value={quoteRu} onChange={(e) => setQuoteRu(e.target.value)} />
          </Field>
          <Field label={t("testimonialQuoteUz")}>
            <Textarea rows={3} value={quoteUz} onChange={(e) => setQuoteUz(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("testimonialAuthor")}>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </Field>
            <Field label={t("testimonialRoleRu")}>
              <Input value={roleRu} onChange={(e) => setRoleRu(e.target.value)} />
            </Field>
            <Field label={t("testimonialRoleUz")}>
              <Input value={roleUz} onChange={(e) => setRoleUz(e.target.value)} />
            </Field>
          </div>
          <CommonFooterFields
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            published={published}
            setPublished={setPublished}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={saving || !filled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Тексты секции ───────────────────────────────────────────────────────
// Каждая вкладка показывает только тексты своей секции (по префиксам ключей).

function SectionTexts({
  rows,
  notify,
  prefixes,
  withHeading = false,
}: {
  rows: TextRow[];
  notify: Notify;
  prefixes: string[];
  withHeading?: boolean;
}) {
  const t = useTranslations("landingAdmin");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { ru: string; uz: string }>>({});
  const [saving, setSaving] = useState(false);

  const sectionRows = useMemo(
    () => rows.filter((r) => prefixes.some((p) => r.key.startsWith(p))),
    [rows, prefixes]
  );

  const changed = useMemo(
    () =>
      Object.entries(drafts).filter(([key, val]) => {
        const orig = sectionRows.find((r) => r.key === key);
        return orig && (orig.ru !== val.ru || orig.uz !== val.uz);
      }),
    [drafts, sectionRows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sectionRows;
    return sectionRows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.ru.toLowerCase().includes(q) ||
        r.uz.toLowerCase().includes(q)
    );
  }, [sectionRows, search]);

  const value = (row: TextRow) => drafts[row.key] ?? { ru: row.ru, uz: row.uz };

  const setValue = (key: string, lang: "ru" | "uz", v: string) => {
    setDrafts((prev) => {
      const row = sectionRows.find((r) => r.key === key);
      const base = prev[key] ?? { ru: row?.ru ?? "", uz: row?.uz ?? "" };
      return { ...prev, [key]: { ...base, [lang]: v } };
    });
  };

  const saveAll = async () => {
    setSaving(true);
    const ok = notify(
      await saveMarketingTexts(changed.map(([key, val]) => ({ key, ru: val.ru, uz: val.uz })))
    );
    setSaving(false);
    if (ok) setDrafts({});
  };

  if (sectionRows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("textsEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {withHeading && <h3 className="text-lg font-semibold">{t("sectionTextsHeading")}</h3>}
      <div className="flex flex-wrap items-center gap-3">
        {sectionRows.length > 6 && (
          <Input
            className="max-w-sm"
            placeholder={t("textsSearch")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <Button onClick={saveAll} disabled={saving || changed.length === 0}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("textsSaveAll", { count: changed.length })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("textsHint")}</p>

      <div className="space-y-3">
        {filtered.map((row) => {
          const v = value(row);
          const isChanged = v.ru !== row.ru || v.uz !== row.uz;
          return (
            <div
              key={row.key}
              className={`rounded-lg border p-3 ${isChanged ? "border-primary" : ""}`}
            >
              <p className="mb-2 font-mono text-xs text-muted-foreground">{row.key}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs">{t("textsRuColumn")}</Label>
                  <Textarea
                    rows={2}
                    value={v.ru}
                    onChange={(e) => setValue(row.key, "ru", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">{t("textsUzColumn")}</Label>
                  <Textarea
                    rows={2}
                    value={v.uz}
                    onChange={(e) => setValue(row.key, "uz", e.target.value)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
