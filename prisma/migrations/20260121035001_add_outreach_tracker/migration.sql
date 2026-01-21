-- CreateEnum
CREATE TYPE "OutreachType" AS ENUM ('CONNECTION_REQUEST', 'CONNECTION_ONLY', 'INMAIL', 'DIRECT_MESSAGE');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('SENT', 'DELIVERED', 'CONNECTION_ACCEPTED', 'PITCH_PENDING', 'PITCH_SENT', 'REPLIED', 'NO_RESPONSE', 'DECLINED', 'BOUNCED');

-- CreateTable
CREATE TABLE "outreach_tracker" (
    "id" TEXT NOT NULL,
    "candidateProviderId" TEXT NOT NULL,
    "candidateName" TEXT,
    "candidateProfileUrl" TEXT,
    "outreachType" "OutreachType" NOT NULL,
    "messageContent" TEXT,
    "jobRequisitionId" TEXT,
    "jobTitle" TEXT,
    "assessmentTemplateId" TEXT,
    "status" "OutreachStatus" NOT NULL DEFAULT 'SENT',
    "statusHistory" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "pitchSentAt" TIMESTAMP(3),
    "rileyConversationId" TEXT,
    "sequencePosition" INTEGER NOT NULL DEFAULT 0,
    "nextFollowUpAt" TIMESTAMP(3),
    "sourceQueueItemId" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'development',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_tracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_tracker_rileyConversationId_key" ON "outreach_tracker"("rileyConversationId");

-- CreateIndex
CREATE INDEX "outreach_tracker_status_idx" ON "outreach_tracker"("status");

-- CreateIndex
CREATE INDEX "outreach_tracker_candidateProviderId_idx" ON "outreach_tracker"("candidateProviderId");

-- CreateIndex
CREATE INDEX "outreach_tracker_nextFollowUpAt_idx" ON "outreach_tracker"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "outreach_tracker_tenantId_idx" ON "outreach_tracker"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_tracker_candidateProviderId_jobRequisitionId_key" ON "outreach_tracker"("candidateProviderId", "jobRequisitionId");

-- AddForeignKey
ALTER TABLE "outreach_tracker" ADD CONSTRAINT "outreach_tracker_rileyConversationId_fkey" FOREIGN KEY ("rileyConversationId") REFERENCES "riley_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
