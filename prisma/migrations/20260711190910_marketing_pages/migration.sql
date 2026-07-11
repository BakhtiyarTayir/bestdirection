-- CreateTable
CREATE TABLE "MarketingPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleUz" TEXT NOT NULL,
    "contentRu" JSONB,
    "contentUz" JSONB,
    "seoTitleRu" TEXT,
    "seoTitleUz" TEXT,
    "seoDescRu" TEXT,
    "seoDescUz" TEXT,
    "showInFooter" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingPage_slug_key" ON "MarketingPage"("slug");

-- CreateIndex
CREATE INDEX "MarketingPage_published_idx" ON "MarketingPage"("published");
