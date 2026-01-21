-- CreateTable
CREATE TABLE "recruiter_calendly_links" (
    "id" TEXT NOT NULL,
    "recruiterName" TEXT NOT NULL,
    "calendlyUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignmentCount" INTEGER NOT NULL DEFAULT 0,
    "lastAssignedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL DEFAULT 'development',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recruiter_calendly_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendly_link_assignments" (
    "id" TEXT NOT NULL,
    "calendlyLinkId" TEXT NOT NULL,
    "candidateProviderId" TEXT NOT NULL,
    "candidateName" TEXT,
    "jobRequisitionId" TEXT,
    "rileyConversationId" TEXT,
    "linkSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "bookingConfirmedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL DEFAULT 'development',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendly_link_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_settings" (
    "id" TEXT NOT NULL,
    "autoPitchOnAcceptance" BOOLEAN NOT NULL DEFAULT true,
    "pitchDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "followUpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "followUpDays" JSONB NOT NULL DEFAULT '[3, 7, 14]',
    "maxFollowUps" INTEGER NOT NULL DEFAULT 3,
    "includeCalendlyInFinal" BOOLEAN NOT NULL DEFAULT true,
    "autoRespondEnabled" BOOLEAN NOT NULL DEFAULT true,
    "escalateToHumanKeywords" JSONB NOT NULL DEFAULT '["salary", "compensation", "benefits"]',
    "tenantId" TEXT NOT NULL DEFAULT 'development',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recruiter_calendly_links_tenantId_isActive_idx" ON "recruiter_calendly_links"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "calendly_link_assignments_calendlyLinkId_idx" ON "calendly_link_assignments"("calendlyLinkId");

-- CreateIndex
CREATE INDEX "calendly_link_assignments_candidateProviderId_idx" ON "calendly_link_assignments"("candidateProviderId");

-- CreateIndex
CREATE INDEX "calendly_link_assignments_tenantId_idx" ON "calendly_link_assignments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_settings_tenantId_key" ON "outreach_settings"("tenantId");

-- AddForeignKey
ALTER TABLE "calendly_link_assignments" ADD CONSTRAINT "calendly_link_assignments_calendlyLinkId_fkey" FOREIGN KEY ("calendlyLinkId") REFERENCES "recruiter_calendly_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
