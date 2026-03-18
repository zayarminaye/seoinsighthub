-- AlterTable
ALTER TABLE "AdminSettings"
ADD COLUMN "geminiMaxQueriesPerAudit" INTEGER NOT NULL DEFAULT 12;
