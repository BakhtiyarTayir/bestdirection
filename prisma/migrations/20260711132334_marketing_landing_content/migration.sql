-- CreateTable
CREATE TABLE "MarketingCourse" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summaryRu" TEXT,
    "summaryUz" TEXT,
    "cover" TEXT,
    "price" INTEGER,
    "intakeStartDate" TIMESTAMP(3),
    "intakeSeats" INTEGER,
    "intakeNoteRu" TEXT,
    "intakeNoteUz" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingReel" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingReel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingGalleryItem" (
    "id" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleUz" TEXT NOT NULL,
    "textRu" TEXT NOT NULL,
    "textUz" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingGalleryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingTestimonial" (
    "id" TEXT NOT NULL,
    "quoteRu" TEXT NOT NULL,
    "quoteUz" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "roleRu" TEXT NOT NULL,
    "roleUz" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingTestimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingText" (
    "key" TEXT NOT NULL,
    "ru" TEXT NOT NULL,
    "uz" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingText_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCourse_slug_key" ON "MarketingCourse"("slug");

-- CreateIndex
CREATE INDEX "MarketingCourse_published_sortOrder_idx" ON "MarketingCourse"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "MarketingReel_published_sortOrder_idx" ON "MarketingReel"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "MarketingGalleryItem_published_sortOrder_idx" ON "MarketingGalleryItem"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "MarketingTestimonial_published_sortOrder_idx" ON "MarketingTestimonial"("published", "sortOrder");
