-- CreateTable
CREATE TABLE "AiUsageQuota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "descriptionCount" INTEGER NOT NULL DEFAULT 0,
    "coverCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageQuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageQuota_userId_date_key" ON "AiUsageQuota"("userId", "date");

-- CreateIndex
CREATE INDEX "AiUsageQuota_date_idx" ON "AiUsageQuota"("date");
