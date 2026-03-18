-- AlterTable
ALTER TABLE "User" ADD COLUMN "geminiApiKeyEncrypted" TEXT;

-- CreateTable
CREATE TABLE "AdminSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "geminiApiKeyEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
);
