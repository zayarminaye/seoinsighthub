-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('QUEUED', 'CRAWLING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'SERIOUS', 'MODERATE', 'MINOR');

-- CreateEnum
CREATE TYPE "InpRating" AS ENUM ('GOOD', 'NEEDS_IMPROVEMENT', 'POOR');

-- CreateEnum
CREATE TYPE "DecayBucket" AS ENUM ('HEALTHY', 'STAGNANT', 'DECLINING', 'DECAY_CANDIDATE');

-- CreateEnum
CREATE TYPE "CitationPlatform" AS ENUM ('GEMINI', 'PERPLEXITY', 'CHATGPT', 'CLAUDE');

-- CreateEnum
CREATE TYPE "GapType" AS ENUM ('CITATION_GAP', 'LOW_VISIBILITY', 'NOT_CITED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "auditLimit" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetDomain" TEXT NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
    "selectedSteps" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "seedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "competitorDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxPages" INTEGER NOT NULL DEFAULT 500,
    "totalPages" INTEGER NOT NULL DEFAULT 0,
    "completedPages" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER,
    "currentStepName" TEXT,
    "uraScoreU" DOUBLE PRECISION,
    "uraScoreR" DOUBLE PRECISION,
    "uraScoreA" DOUBLE PRECISION,
    "uraScoreOverall" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPage" (
    "id" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "crawlDepth" INTEGER,
    "performanceScore" DOUBLE PRECISION,
    "inpValue" DOUBLE PRECISION,
    "inpRating" "InpRating",
    "mobileFriendly" BOOLEAN,
    "accessibilityScore" DOUBLE PRECISION,
    "domNodeCount" INTEGER,
    "titleTag" TEXT,
    "titleLength" INTEGER,
    "metaDescription" TEXT,
    "metaDescriptionLength" INTEGER,
    "h1Count" INTEGER,
    "h1FontSizePx" DOUBLE PRECISION,
    "h1IsLargestHeading" BOOLEAN,
    "wordCount" INTEGER,
    "internalLinksInbound" INTEGER,
    "internalLinksOutbound" INTEGER,
    "contentAge" INTEGER,
    "decayBucket" "DecayBucket",
    "hasSameAs" BOOLEAN,
    "sameAsUrls" JSONB,
    "eeatScore" DOUBLE PRECISION,
    "hasAuthorByline" BOOLEAN,
    "hasAuthorPage" BOOLEAN,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "auditPageId" TEXT,
    "stepNumber" INTEGER NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "selector" TEXT,
    "recommendation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationQuery" (
    "id" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "seedKeyword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitationQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationResult" (
    "id" TEXT NOT NULL,
    "citationQueryId" TEXT NOT NULL,
    "platform" "CitationPlatform" NOT NULL,
    "responseText" TEXT NOT NULL,
    "citedDomains" JSONB NOT NULL,
    "clientCited" BOOLEAN NOT NULL,
    "competitorsCited" JSONB NOT NULL,
    "citationContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitationGap" (
    "id" TEXT NOT NULL,
    "citationResultId" TEXT NOT NULL,
    "competitorDomain" TEXT NOT NULL,
    "gapType" "GapType" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "recommendedAction" TEXT,

    CONSTRAINT "CitationGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clerkId_idx" ON "User"("clerkId");

-- CreateIndex
CREATE INDEX "AuditRun_userId_idx" ON "AuditRun"("userId");

-- CreateIndex
CREATE INDEX "AuditRun_status_idx" ON "AuditRun"("status");

-- CreateIndex
CREATE INDEX "AuditRun_createdAt_idx" ON "AuditRun"("createdAt");

-- CreateIndex
CREATE INDEX "AuditPage_auditRunId_idx" ON "AuditPage"("auditRunId");

-- CreateIndex
CREATE INDEX "AuditPage_decayBucket_idx" ON "AuditPage"("decayBucket");

-- CreateIndex
CREATE INDEX "AuditPage_performanceScore_idx" ON "AuditPage"("performanceScore");

-- CreateIndex
CREATE INDEX "AuditPage_domNodeCount_idx" ON "AuditPage"("domNodeCount");

-- CreateIndex
CREATE INDEX "AuditIssue_auditRunId_idx" ON "AuditIssue"("auditRunId");

-- CreateIndex
CREATE INDEX "AuditIssue_severity_idx" ON "AuditIssue"("severity");

-- CreateIndex
CREATE INDEX "AuditIssue_stepNumber_idx" ON "AuditIssue"("stepNumber");

-- CreateIndex
CREATE INDEX "AuditIssue_auditRunId_severity_idx" ON "AuditIssue"("auditRunId", "severity");

-- CreateIndex
CREATE INDEX "CitationQuery_auditRunId_idx" ON "CitationQuery"("auditRunId");

-- CreateIndex
CREATE INDEX "CitationResult_citationQueryId_idx" ON "CitationResult"("citationQueryId");

-- CreateIndex
CREATE INDEX "CitationResult_platform_idx" ON "CitationResult"("platform");

-- CreateIndex
CREATE INDEX "CitationGap_citationResultId_idx" ON "CitationGap"("citationResultId");

-- CreateIndex
CREATE INDEX "CitationGap_gapType_idx" ON "CitationGap"("gapType");

-- AddForeignKey
ALTER TABLE "AuditRun" ADD CONSTRAINT "AuditRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPage" ADD CONSTRAINT "AuditPage_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditIssue" ADD CONSTRAINT "AuditIssue_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditIssue" ADD CONSTRAINT "AuditIssue_auditPageId_fkey" FOREIGN KEY ("auditPageId") REFERENCES "AuditPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationQuery" ADD CONSTRAINT "CitationQuery_auditRunId_fkey" FOREIGN KEY ("auditRunId") REFERENCES "AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationResult" ADD CONSTRAINT "CitationResult_citationQueryId_fkey" FOREIGN KEY ("citationQueryId") REFERENCES "CitationQuery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitationGap" ADD CONSTRAINT "CitationGap_citationResultId_fkey" FOREIGN KEY ("citationResultId") REFERENCES "CitationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
