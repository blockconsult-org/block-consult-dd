-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DDCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectName" TEXT NOT NULL,
    "clientName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reportType" TEXT NOT NULL DEFAULT 'full_institutional',
    "analyst" TEXT,
    "brand" TEXT NOT NULL DEFAULT 'Block Consult GmbH',
    "confidentiality" TEXT NOT NULL DEFAULT 'Private and confidential',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    CONSTRAINT "DDCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "tickers" TEXT NOT NULL DEFAULT '[]',
    "links" TEXT NOT NULL DEFAULT '[]',
    "contractAddresses" TEXT NOT NULL DEFAULT '[]',
    "chains" TEXT NOT NULL DEFAULT '[]',
    "claimedPartnerships" TEXT NOT NULL DEFAULT '[]',
    "claimedExchangeListings" TEXT NOT NULL DEFAULT '[]',
    "walletAddresses" TEXT NOT NULL DEFAULT '[]',
    "counterparties" TEXT NOT NULL DEFAULT '[]',
    "documents" TEXT NOT NULL DEFAULT '[]',
    "questionsToVerify" TEXT NOT NULL DEFAULT '[]',
    "offerType" TEXT,
    "offerPrice" TEXT,
    "investmentAmount" TEXT,
    "lockupVesting" TEXT,
    "sellerDetails" TEXT,
    "clientJurisdiction" TEXT,
    "issuerJurisdiction" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntakeInput_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Source" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Source_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceClaim" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceClaim_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceClaim_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "entityType" TEXT NOT NULL DEFAULT 'unknown',
    "role" TEXT,
    "jurisdiction" TEXT,
    "registrationNumber" TEXT,
    "registeredAddress" TEXT,
    "incorporationDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "website" TEXT,
    "licenses" TEXT NOT NULL DEFAULT '[]',
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Entity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "roles" TEXT NOT NULL DEFAULT '[]',
    "linkedinUrl" TEXT,
    "xUrl" TEXT,
    "githubUrl" TEXT,
    "education" TEXT NOT NULL DEFAULT '[]',
    "previousCompanies" TEXT NOT NULL DEFAULT '[]',
    "knownProjects" TEXT NOT NULL DEFAULT '[]',
    "media" TEXT NOT NULL DEFAULT '[]',
    "legalHistory" TEXT,
    "reputationNotes" TEXT,
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Person_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "chain" TEXT,
    "contractAddress" TEXT,
    "tokenStandard" TEXT,
    "decimals" INTEGER,
    "issuerEntityId" TEXT,
    "officialSources" TEXT NOT NULL DEFAULT '[]',
    "marketCap" REAL,
    "fdv" REAL,
    "price" REAL,
    "circulatingSupply" REAL,
    "totalSupply" REAL,
    "maxSupply" REAL,
    "supplyTimestamp" DATETIME,
    "vestingNotes" TEXT,
    "utility" TEXT NOT NULL DEFAULT '[]',
    "valueCapture" TEXT NOT NULL DEFAULT '[]',
    "rightsDisclaimer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Token_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'unknown',
    "amountTokens" REAL,
    "percentageTotal" REAL,
    "lockedAmount" REAL,
    "unlockedAmount" REAL,
    "vestingTerms" TEXT,
    "wallets" TEXT NOT NULL DEFAULT '[]',
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    CONSTRAINT "TokenAllocation_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnlockEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "date" TEXT,
    "amountTokens" REAL,
    "percentageSupply" REAL,
    "category" TEXT,
    "recipientGroup" TEXT,
    "cliff" BOOLEAN NOT NULL DEFAULT false,
    "linear" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "notes" TEXT,
    CONSTRAINT "UnlockEvent_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenomicsSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "insiderPercentage" REAL,
    "treasuryPercentage" REAL,
    "marketMakerPct" REAL,
    "communityPercentage" REAL,
    "emissionsSummary" TEXT,
    "stakingRewards" TEXT,
    "vestingSummary" TEXT,
    "dilutionRisk" TEXT,
    "concentrationRisk" TEXT,
    "nextUnlockDate" TEXT,
    "nextUnlockPct" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenomicsSchedule_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "tokenId" TEXT,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "proxy" BOOLEAN NOT NULL DEFAULT false,
    "implementationAddress" TEXT,
    "ownerAddress" TEXT,
    "adminAddresses" TEXT NOT NULL DEFAULT '[]',
    "multisig" BOOLEAN NOT NULL DEFAULT false,
    "multisigSigners" TEXT NOT NULL DEFAULT '[]',
    "timelock" BOOLEAN NOT NULL DEFAULT false,
    "canPause" BOOLEAN NOT NULL DEFAULT false,
    "canBlacklist" BOOLEAN NOT NULL DEFAULT false,
    "canFreeze" BOOLEAN NOT NULL DEFAULT false,
    "canMint" BOOLEAN NOT NULL DEFAULT false,
    "canBurn" BOOLEAN NOT NULL DEFAULT false,
    "canUpgrade" BOOLEAN NOT NULL DEFAULT false,
    "auditReports" TEXT NOT NULL DEFAULT '[]',
    "securityNotes" TEXT,
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenContract_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TokenContract_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "tokenId" TEXT,
    "exchange" TEXT NOT NULL,
    "base" TEXT,
    "quote" TEXT,
    "pair" TEXT,
    "marketType" TEXT NOT NULL DEFAULT 'unknown',
    "url" TEXT,
    "price" REAL,
    "volume24h" REAL,
    "spreadBps" REAL,
    "depthPlus2PctUsd" REAL,
    "depthMinus2PctUsd" REAL,
    "orderBookTimestamp" DATETIME,
    "depositStatus" TEXT NOT NULL DEFAULT 'unknown',
    "withdrawalStatus" TEXT NOT NULL DEFAULT 'unknown',
    "networks" TEXT NOT NULL DEFAULT '[]',
    "trustScore" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeMarket_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExchangeMarket_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlippageEstimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "exchange" TEXT,
    "pair" TEXT,
    "side" TEXT NOT NULL DEFAULT 'buy',
    "notionalUsd" REAL,
    "estimatedSlippagePercent" REAL,
    "method" TEXT NOT NULL DEFAULT 'heuristic',
    "snapshotTimestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    CONSTRAINT "SlippageEstimate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiquiditySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "tokenId" TEXT,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalLiquidityUsd" REAL,
    "cexLiquidityUsd" REAL,
    "dexLiquidityUsd" REAL,
    "volume24h" REAL,
    "venueCount" INTEGER,
    "washTradingFlags" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT,
    "notes" TEXT,
    CONSTRAINT "LiquiditySnapshot_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiquiditySnapshot_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HolderSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "tokenId" TEXT,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractAddress" TEXT,
    "totalHolders" INTEGER,
    "top10Pct" REAL,
    "top50Pct" REAL,
    "topWallets" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT,
    "notes" TEXT,
    CONSTRAINT "HolderSnapshot_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HolderSnapshot_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StablecoinProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "issuerEntityId" TEXT,
    "jurisdiction" TEXT,
    "classification" TEXT NOT NULL DEFAULT 'unknown',
    "contractAddresses" TEXT NOT NULL DEFAULT '[]',
    "reserveAssets" TEXT NOT NULL DEFAULT '[]',
    "reserveCustodians" TEXT NOT NULL DEFAULT '[]',
    "redemptionParty" TEXT,
    "redemptionTerms" TEXT,
    "attestations" TEXT NOT NULL DEFAULT '[]',
    "canPauseRedemptions" BOOLEAN NOT NULL DEFAULT false,
    "blacklistFreeze" BOOLEAN NOT NULL DEFAULT false,
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StablecoinProfile_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RWAAssetProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "assetDescription" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'other',
    "jurisdiction" TEXT,
    "legalOwnerBefore" TEXT,
    "legalOwnerAfter" TEXT,
    "spvEntityId" TEXT,
    "custodianEntityId" TEXT,
    "tokenContract" TEXT,
    "investorRights" TEXT NOT NULL DEFAULT '[]',
    "redemptionRights" TEXT,
    "cashflowRights" TEXT,
    "valuationMethod" TEXT,
    "appraisalSource" TEXT,
    "insurance" TEXT,
    "riskScore" TEXT,
    "sourceIds" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RWAAssetProfile_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "claim" TEXT,
    "evidenceIds" TEXT NOT NULL DEFAULT '[]',
    "analysis" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'informational',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "impact" TEXT,
    "mitigation" TEXT,
    "openQuestions" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'worker',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskFinding_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RedFlag" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedFlag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scorecard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "legalRegulatoryClarity" REAL,
    "fraudImpersonationRisk" REAL,
    "tokenValueCapture" REAL,
    "marketLiquidity" REAL,
    "teamFounderQuality" REAL,
    "businessFundamentals" REAL,
    "valuationAttractiveness" REAL,
    "technicalSafety" REAL,
    "partnershipCredibility" REAL,
    "transparencyDisclosure" REAL,
    "overallScore" REAL,
    "recommendation" TEXT,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'medium',
    "gatingApplied" TEXT NOT NULL DEFAULT '[]',
    "rationale" TEXT NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Scorecard_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'full_institutional',
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recommendation" TEXT,
    "overallScore" REAL,
    "confidenceLevel" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contentJson" TEXT NOT NULL DEFAULT '{}',
    "qaJson" TEXT NOT NULL DEFAULT '{}',
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Report_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "bodyJson" TEXT NOT NULL DEFAULT '{}',
    "bodyMarkdown" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ReportSection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "reportId" TEXT,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedFile_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedFile_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reportType" TEXT NOT NULL DEFAULT 'full_institutional',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DDCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "researchRunId" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "inputJson" TEXT NOT NULL DEFAULT '{}',
    "outputJson" TEXT NOT NULL DEFAULT '{}',
    "logs" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    CONSTRAINT "WorkerTrace_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "ResearchRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeInput_caseId_key" ON "IntakeInput"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenomicsSchedule_tokenId_key" ON "TokenomicsSchedule"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_caseId_key" ON "Scorecard"("caseId");

