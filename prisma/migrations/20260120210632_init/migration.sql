-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ONBOARDING', 'SHADOW_MODE', 'SUPERVISED', 'AUTONOMOUS', 'PAUSED');

-- CreateEnum
CREATE TYPE "GuidelinesStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreatedBy" AS ENUM ('AGENT', 'TELEOPERATOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CriteriaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED_FILLED', 'CLOSED_CANCELLED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('SOURCED', 'CONTACTED', 'RESPONDED', 'SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEWING', 'OFFER_EXTENDED', 'OFFER_ACCEPTED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'ARCHIVED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'LINKEDIN', 'SMS', 'PHONE', 'IN_APP');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'WAITING_RESPONSE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('CANDIDATE', 'AGENT', 'TELEOPERATOR');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('RESUME_SCREEN', 'SKILLS_MATCH', 'EXPERIENCE_FIT', 'CULTURE_FIT', 'COMMUNICATION', 'TECHNICAL_SCREEN');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('OUTREACH_SENT', 'RESPONSE_RECEIVED', 'FOLLOW_UP_SENT', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'FEEDBACK_PROVIDED', 'STAGE_CHANGED', 'NOTE_ADDED', 'ASSESSMENT_COMPLETED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('SEND_EMAIL', 'SEND_LINKEDIN_MESSAGE', 'SEND_FOLLOW_UP', 'SEARCH_CANDIDATES', 'IMPORT_CANDIDATE', 'SCREEN_RESUME', 'GENERATE_ASSESSMENT', 'SCHEDULE_INTERVIEW', 'SEND_REMINDER', 'UPDATE_ATS_STATUS', 'SYNC_CANDIDATE', 'PREPARE_OFFER', 'SEND_OFFER', 'UPDATE_GUIDELINES', 'GENERATE_REPORT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EscalationReason" AS ENUM ('SENSITIVE_COMMUNICATION', 'BUDGET_DISCUSSION', 'OFFER_NEGOTIATION', 'CANDIDATE_COMPLAINT', 'EDGE_CASE', 'LOW_CONFIDENCE', 'POLICY_VIOLATION_RISK', 'FIRST_CONTACT_VIP', 'MANUAL_REVIEW_REQUESTED');

-- CreateEnum
CREATE TYPE "TeleoperatorRole" AS ENUM ('REVIEWER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('ATS', 'EMAIL', 'CALENDAR', 'LINKEDIN', 'JOB_BOARD');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('JOB_DESCRIPTION', 'COMPANY_INFO', 'BRAND_GUIDELINES', 'PAST_PLACEMENT', 'EMAIL_TEMPLATE', 'RECRUITING_PLAYBOOK', 'INTERVIEW_GUIDE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "InnerLoopStatus" AS ENUM ('RUNNING', 'CONVERGED', 'MAX_ITERATIONS_REACHED', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RileyConversationStage" AS ENUM ('INITIAL_OUTREACH', 'AWAITING_RESPONSE', 'IN_CONVERSATION', 'SCHEDULING', 'SCHEDULED', 'FOLLOW_UP', 'CLOSED_INTERESTED', 'CLOSED_NOT_INTERESTED', 'CLOSED_NO_RESPONSE');

-- CreateEnum
CREATE TYPE "RileyConversationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ESCALATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LastMessageBy" AS ENUM ('RILEY', 'CANDIDATE', 'TELEOPERATOR');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('RILEY', 'CANDIDATE', 'TELEOPERATOR');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ONBOARDING',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guidelines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "GuidelinesStatus" NOT NULL DEFAULT 'DRAFT',
    "workflows" JSONB NOT NULL DEFAULT '[]',
    "templates" JSONB NOT NULL DEFAULT '[]',
    "decisionTrees" JSONB NOT NULL DEFAULT '[]',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "createdBy" "CreatedBy" NOT NULL,
    "parentVersionId" TEXT,
    "changelog" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guidelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CriteriaStatus" NOT NULL DEFAULT 'DRAFT',
    "qualityStandards" JSONB NOT NULL DEFAULT '[]',
    "evaluationRubrics" JSONB NOT NULL DEFAULT '[]',
    "successMetrics" JSONB NOT NULL DEFAULT '[]',
    "failurePatterns" JSONB NOT NULL DEFAULT '[]',
    "createdBy" "CreatedBy" NOT NULL,
    "parentVersionId" TEXT,
    "changelog" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_requisitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "preferredSkills" JSONB NOT NULL DEFAULT '[]',
    "location" TEXT,
    "locationType" "LocationType" NOT NULL DEFAULT 'UNSPECIFIED',
    "salaryRange" JSONB,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "hiringManager" TEXT,
    "interviewStages" JSONB NOT NULL DEFAULT '[]',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "targetFillDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "externalIds" JSONB NOT NULL DEFAULT '[]',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "linkedInUrl" TEXT,
    "resumeUrl" TEXT,
    "profileData" JSONB NOT NULL DEFAULT '{}',
    "stage" "PipelineStage" NOT NULL DEFAULT 'SOURCED',
    "stageHistory" JSONB NOT NULL DEFAULT '[]',
    "overallScore" DOUBLE PRECISION,
    "scoreBreakdown" JSONB,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'ACTIVE',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalThreadId" TEXT,
    "subject" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3),
    "currentIntent" TEXT,
    "intentConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "senderType" "SenderType" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "type" "AssessmentType" NOT NULL,
    "dimension" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "reasoning" TEXT,
    "assessedBy" "CreatedBy" NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "channel" "Channel",
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "performedBy" "CreatedBy" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisitionId" TEXT,
    "type" "TaskType" NOT NULL,
    "payload" JSONB NOT NULL,
    "innerLoopId" TEXT,
    "iterations" INTEGER NOT NULL DEFAULT 0,
    "converged" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "effectful" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" "EscalationReason",
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionResult" JSONB,
    "executionError" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "scheduledFor" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teleoperator_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "TeleoperatorRole" NOT NULL DEFAULT 'REVIEWER',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teleoperator_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "extractedContent" JSONB,
    "extractedPatterns" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inner_loop_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskType" "TaskType" NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "status" "InnerLoopStatus" NOT NULL DEFAULT 'RUNNING',
    "iterations" INTEGER NOT NULL DEFAULT 0,
    "maxIterations" INTEGER NOT NULL DEFAULT 5,
    "converged" BOOLEAN NOT NULL DEFAULT false,
    "finalScore" DOUBLE PRECISION,
    "convergenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "startGuidelinesVersion" INTEGER NOT NULL,
    "endGuidelinesVersion" INTEGER,
    "guidelinesUpdates" JSONB NOT NULL DEFAULT '[]',
    "outputTaskId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inner_loop_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riley_conversations" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "candidateProviderId" TEXT NOT NULL,
    "candidateName" TEXT,
    "candidateTitle" TEXT,
    "candidateCompany" TEXT,
    "candidateProfileUrl" TEXT,
    "jobRequisitionId" TEXT,
    "jobTitle" TEXT,
    "stage" "RileyConversationStage" NOT NULL DEFAULT 'INITIAL_OUTREACH',
    "status" "RileyConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "messageCount" INTEGER NOT NULL DEFAULT 1,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageBy" "LastMessageBy" NOT NULL DEFAULT 'RILEY',
    "schedulingRequested" BOOLEAN NOT NULL DEFAULT false,
    "scheduledCallAt" TIMESTAMP(3),
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riley_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riley_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "unipileMessageId" TEXT,
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riley_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "guidelines_tenantId_status_idx" ON "guidelines"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guidelines_tenantId_version_key" ON "guidelines"("tenantId", "version");

-- CreateIndex
CREATE INDEX "criteria_tenantId_status_idx" ON "criteria"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_tenantId_version_key" ON "criteria"("tenantId", "version");

-- CreateIndex
CREATE INDEX "job_requisitions_tenantId_status_idx" ON "job_requisitions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_requisitions_tenantId_externalId_key" ON "job_requisitions"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "candidates_tenantId_stage_idx" ON "candidates"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "candidates_tenantId_email_idx" ON "candidates"("tenantId", "email");

-- CreateIndex
CREATE INDEX "conversations_tenantId_candidateId_idx" ON "conversations"("tenantId", "candidateId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_status_idx" ON "conversations"("tenantId", "status");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "assessments_candidateId_idx" ON "assessments"("candidateId");

-- CreateIndex
CREATE INDEX "interactions_candidateId_performedAt_idx" ON "interactions"("candidateId", "performedAt");

-- CreateIndex
CREATE INDEX "tasks_tenantId_status_idx" ON "tasks"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tasks_tenantId_type_idx" ON "tasks"("tenantId", "type");

-- CreateIndex
CREATE INDEX "tasks_status_scheduledFor_idx" ON "tasks"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "teleoperator_assignments_tenantId_userId_key" ON "teleoperator_assignments"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenantId_type_provider_key" ON "integrations"("tenantId", "type", "provider");

-- CreateIndex
CREATE INDEX "documents_tenantId_type_idx" ON "documents"("tenantId", "type");

-- CreateIndex
CREATE INDEX "inner_loop_runs_tenantId_createdAt_idx" ON "inner_loop_runs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "inner_loop_runs_status_idx" ON "inner_loop_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "riley_conversations_chatId_key" ON "riley_conversations"("chatId");

-- CreateIndex
CREATE INDEX "riley_conversations_chatId_idx" ON "riley_conversations"("chatId");

-- CreateIndex
CREATE INDEX "riley_conversations_candidateProviderId_idx" ON "riley_conversations"("candidateProviderId");

-- CreateIndex
CREATE INDEX "riley_conversations_status_stage_idx" ON "riley_conversations"("status", "stage");

-- CreateIndex
CREATE INDEX "riley_messages_conversationId_createdAt_idx" ON "riley_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guidelines" ADD CONSTRAINT "guidelines_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "guidelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "criteria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "job_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "job_requisitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teleoperator_assignments" ADD CONSTRAINT "teleoperator_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riley_messages" ADD CONSTRAINT "riley_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "riley_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
