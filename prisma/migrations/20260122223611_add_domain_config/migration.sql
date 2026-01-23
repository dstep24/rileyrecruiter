-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GuidelinesScope" AS ENUM ('TENANT', 'DOMAIN');

-- CreateEnum
CREATE TYPE "CriteriaScope" AS ENUM ('TENANT', 'DOMAIN');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED');

-- AlterEnum
ALTER TYPE "OutreachChannel" ADD VALUE 'GITHUB';

-- AlterEnum
ALTER TYPE "OutreachType" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "emailSource" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "githubBio" TEXT,
ADD COLUMN     "githubEmail" TEXT,
ADD COLUMN     "githubEmailSource" TEXT,
ADD COLUMN     "githubFollowers" INTEGER,
ADD COLUMN     "githubRepos" INTEGER,
ADD COLUMN     "githubTopLanguages" JSONB DEFAULT '[]',
ADD COLUMN     "githubUrl" TEXT,
ADD COLUMN     "githubUsername" TEXT,
ADD COLUMN     "personalEmail" TEXT;

-- AlterTable
ALTER TABLE "criteria" ADD COLUMN     "scope" "CriteriaScope" NOT NULL DEFAULT 'TENANT';

-- AlterTable
ALTER TABLE "guidelines" ADD COLUMN     "scope" "GuidelinesScope" NOT NULL DEFAULT 'TENANT';

-- AlterTable
ALTER TABLE "inner_loop_runs" ADD COLUMN     "domainId" TEXT,
ADD COLUMN     "learningInsights" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "outreach_tracker" ADD COLUMN     "channel" "OutreachChannel" NOT NULL DEFAULT 'LINKEDIN_CONNECTION',
ADD COLUMN     "emailAddress" TEXT,
ADD COLUMN     "emailBounceReason" TEXT,
ADD COLUMN     "emailBouncedAt" TIMESTAMP(3),
ADD COLUMN     "emailClickedAt" TIMESTAMP(3),
ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "emailOpenedAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" "EmailDeliveryStatus";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "domainId" TEXT;

-- CreateTable
CREATE TABLE "domain_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "selectionRules" JSONB NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "guidelinesId" TEXT,
    "criteriaId" TEXT,
    "configOverrides" JSONB NOT NULL DEFAULT '{}',
    "status" "DomainStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domain_configs_tenantId_status_idx" ON "domain_configs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "domain_configs_tenantId_isDefault_idx" ON "domain_configs"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "domain_configs_tenantId_slug_key" ON "domain_configs"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "candidates_tenantId_githubUsername_idx" ON "candidates"("tenantId", "githubUsername");

-- CreateIndex
CREATE INDEX "criteria_tenantId_scope_idx" ON "criteria"("tenantId", "scope");

-- CreateIndex
CREATE INDEX "guidelines_tenantId_scope_idx" ON "guidelines"("tenantId", "scope");

-- CreateIndex
CREATE INDEX "inner_loop_runs_domainId_idx" ON "inner_loop_runs"("domainId");

-- CreateIndex
CREATE INDEX "tasks_domainId_idx" ON "tasks"("domainId");

-- AddForeignKey
ALTER TABLE "domain_configs" ADD CONSTRAINT "domain_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_configs" ADD CONSTRAINT "domain_configs_guidelinesId_fkey" FOREIGN KEY ("guidelinesId") REFERENCES "guidelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_configs" ADD CONSTRAINT "domain_configs_criteriaId_fkey" FOREIGN KEY ("criteriaId") REFERENCES "criteria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domain_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inner_loop_runs" ADD CONSTRAINT "inner_loop_runs_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domain_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
