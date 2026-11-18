-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Secret" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "ciphertext" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "hint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CaseNarrative" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL DEFAULT '{}',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usageJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaseNarrative_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "webSearches" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'unknown',
    "url" TEXT,
    "finalUrl" TEXT,
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retrievedBy" TEXT,
    "httpStatus" INTEGER,
    "contentHash" TEXT,
    "rawPath" TEXT,
    "textPath" TEXT,
    "screenshotPath" TEXT,
    "pdfPath" TEXT,
    "content" TEXT,
    "reliabilityRating" TEXT NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "researchRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Source_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Source" ("caseId", "content", "contentHash", "createdAt", "finalUrl", "httpStatus", "id", "name", "notes", "pdfPath", "rawPath", "reliabilityRating", "retrievedAt", "retrievedBy", "screenshotPath", "sourceType", "textPath", "title", "url") SELECT "caseId", "content", "contentHash", "createdAt", "finalUrl", "httpStatus", "id", "name", "notes", "pdfPath", "rawPath", "reliabilityRating", "retrievedAt", "retrievedBy", "screenshotPath", "sourceType", "textPath", "title", "url" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
CREATE TABLE "new_EvidenceClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "sourceId" TEXT,
    "claimText" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'unknown',
    "claimClass" TEXT NOT NULL DEFAULT 'secondary',
    "reliabilityRating" TEXT NOT NULL DEFAULT 'unknown',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "corroborated" BOOLEAN NOT NULL DEFAULT false,
    "corroboratingIds" TEXT NOT NULL DEFAULT '[]',
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "researchRunId" TEXT,
    "topic" TEXT,
    "quote" TEXT,
    "verification" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceClaim_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceClaim_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EvidenceClaim" ("caseId", "claimClass", "claimText", "confidence", "corroborated", "corroboratingIds", "createdAt", "id", "notes", "reliabilityRating", "retrievedAt", "sourceId", "sourceTitle", "sourceType", "sourceUrl") SELECT "caseId", "claimClass", "claimText", "confidence", "corroborated", "corroboratingIds", "createdAt", "id", "notes", "reliabilityRating", "retrievedAt", "sourceId", "sourceTitle", "sourceType", "sourceUrl" FROM "EvidenceClaim";
DROP TABLE "EvidenceClaim";
ALTER TABLE "new_EvidenceClaim" RENAME TO "EvidenceClaim";
CREATE TABLE "new_RedFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'high',
    "evidence" TEXT,
    "impact" TEXT,
    "mitigation" TEXT,
    "evidenceIds" TEXT NOT NULL DEFAULT '[]',
    "triggered" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'worker',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedFlag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RedFlag" ("caseId", "code", "createdAt", "evidence", "evidenceIds", "id", "impact", "mitigation", "severity", "title", "triggered") SELECT "caseId", "code", "createdAt", "evidence", "evidenceIds", "id", "impact", "mitigation", "severity", "title", "triggered" FROM "RedFlag";
DROP TABLE "RedFlag";
ALTER TABLE "new_RedFlag" RENAME TO "RedFlag";
CREATE TABLE "new_ResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "mode" TEXT NOT NULL DEFAULT 'offline',
    "provider" TEXT,
    "model" TEXT,
    "stage" TEXT,
    "reportType" TEXT NOT NULL DEFAULT 'full_institutional',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "usageJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ResearchRun" ("caseId", "createdAt", "error", "finishedAt", "id", "reportType", "startedAt", "status", "summaryJson") SELECT "caseId", "createdAt", "error", "finishedAt", "id", "reportType", "startedAt", "status", "summaryJson" FROM "ResearchRun";
DROP TABLE "ResearchRun";
ALTER TABLE "new_ResearchRun" RENAME TO "ResearchRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CaseNarrative_caseId_key" ON "CaseNarrative"("caseId");

