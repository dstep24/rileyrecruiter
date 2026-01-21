-- CreateEnum
CREATE TYPE "OutreachCategory" AS ENUM ('INITIAL_OUTREACH', 'FOLLOW_UP_1', 'FOLLOW_UP_2', 'FOLLOW_UP_3', 'REFERRAL_ASK', 'RE_ENGAGEMENT', 'WARM_INTRO', 'POST_INTERVIEW');

-- CreateEnum
CREATE TYPE "OutreachChannel" AS ENUM ('LINKEDIN_CONNECTION', 'LINKEDIN_INMAIL', 'EMAIL');

-- CreateTable
CREATE TABLE "outreach_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "OutreachCategory" NOT NULL,
    "channel" "OutreachChannel" NOT NULL,
    "roleType" TEXT,
    "subjectTemplate" TEXT,
    "messageTemplate" TEXT NOT NULL,
    "brandVoice" TEXT NOT NULL DEFAULT 'professional-warm',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "responseRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outreach_templates_tenantId_category_channel_idx" ON "outreach_templates"("tenantId", "category", "channel");

-- CreateIndex
CREATE INDEX "outreach_templates_tenantId_isActive_idx" ON "outreach_templates"("tenantId", "isActive");
