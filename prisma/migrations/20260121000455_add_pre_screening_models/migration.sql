-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'TEXT', 'YES_NO', 'SCALE', 'DATE');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RileyConversationStage" ADD VALUE 'ASSESSMENT_SENT';
ALTER TYPE "RileyConversationStage" ADD VALUE 'ASSESSMENT_COMPLETE';

-- CreateTable
CREATE TABLE "pre_screening_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_screening_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_screening_questions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "options" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL,
    "scoringWeight" INTEGER NOT NULL DEFAULT 1,
    "idealAnswer" TEXT,

    CONSTRAINT "pre_screening_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_screening_responses" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "candidateName" TEXT,
    "candidateEmail" TEXT,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "aiScore" INTEGER,
    "aiSummary" TEXT,
    "aiFlags" JSONB,
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_screening_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_screening_answers" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "answerValue" JSONB,

    CONSTRAINT "pre_screening_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pre_screening_templates_tenantId_isActive_idx" ON "pre_screening_templates"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "pre_screening_questions_templateId_orderIndex_idx" ON "pre_screening_questions"("templateId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "pre_screening_responses_accessToken_key" ON "pre_screening_responses"("accessToken");

-- CreateIndex
CREATE INDEX "pre_screening_responses_conversationId_idx" ON "pre_screening_responses"("conversationId");

-- CreateIndex
CREATE INDEX "pre_screening_responses_accessToken_idx" ON "pre_screening_responses"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "pre_screening_answers_responseId_questionId_key" ON "pre_screening_answers"("responseId", "questionId");

-- AddForeignKey
ALTER TABLE "pre_screening_questions" ADD CONSTRAINT "pre_screening_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "pre_screening_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_screening_responses" ADD CONSTRAINT "pre_screening_responses_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "pre_screening_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_screening_answers" ADD CONSTRAINT "pre_screening_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "pre_screening_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_screening_answers" ADD CONSTRAINT "pre_screening_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "pre_screening_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
