/**
 * Domain Services Module
 *
 * The four core recruiting capabilities:
 * - Screening: Resume parsing, candidate evaluation, fit scoring
 * - Outreach: Personalized messaging, follow-up sequences
 * - Scheduling: Interview coordination, calendar management
 * - Sourcing: Candidate search, ranking, pipeline building
 */

export {
  ScreeningService,
  getScreeningService,
  resetScreeningService,
  type ParsedResume,
  type ScreeningResult,
  type RequirementMatch,
  type ScreeningConfig,
} from './ScreeningService.js';

export {
  OutreachService,
  getOutreachService,
  resetOutreachService,
  type OutreachMessage,
  type OutreachSequence,
  type ResponseHandlingResult,
  type OutreachConfig,
} from './OutreachService.js';

export {
  SchedulingService,
  getSchedulingService,
  resetSchedulingService,
  type TimeSlot,
  type InterviewRequest,
  type InterviewType,
  type InterviewStatus,
  type Interviewer,
  type CalendarEvent,
  type SchedulingConfig,
} from './SchedulingService.js';

export {
  SourcingService,
  getSourcingService,
  resetSourcingService,
  type SearchQuery,
  type SourceType,
  type SourcedCandidate,
  type CandidatePipeline,
  type SourcingConfig,
} from './SourcingService.js';

export {
  JobDescriptionParser,
  getJobDescriptionParser,
  type ParsedJobCriteria,
  type JobDescriptionInput,
} from './JobDescriptionParser.js';

// AI-Powered Services
export {
  AICandidateScorer,
  getAICandidateScorer,
  resetAICandidateScorer,
  unipileProfileToCandidateProfile,
  deriveRoleRequirements,
  type CandidateProfile,
  type CandidateExperience,
  type CandidateEducation,
  type RoleRequirements,
  type SeniorityLevel,
  type CandidateScore,
  type DimensionScore,
  type Recommendation,
  type BatchScoringResult,
} from './AICandidateScorer.js';

export {
  AIQueryGenerator,
  getAIQueryGenerator,
  resetAIQueryGenerator,
  buildBooleanQuery,
  buildBooleanQueryForApi,
  getMinYearsForLevel,
  calculateTotalYears,
  type AIQueryGeneratorInput,
  type AISearchStrategy,
  type SearchQuery as AISearchQuery,
} from './AIQueryGenerator.js';

export {
  AIOutreachGenerator,
  getAIOutreachGenerator,
  resetAIOutreachGenerator,
  createDefaultGuidelines,
  validateMessageLength,
  truncateMessage,
  type OutreachInput,
  type RoleInfo,
  type OutreachGuidelines,
  type BrandVoice,
  type OutreachChannel,
  type GeneratedOutreach,
  type FollowUpMessage,
} from './AIOutreachGenerator.js';

// 4-Pillar Sourcing Scorer (Role, Scope, Technical, Location)
export {
  AISourcingScorer,
  getAISourcingScorer,
  resetAISourcingScorer,
  type CandidateInput,
  type CandidateExperience as SourcingCandidateExperience,
  type RoleInput,
  type TechnicalRequirements,
  type PillarScore,
  type SourcingScore,
  type BatchSourcingResult,
} from './AISourcingScorer.js';

// Company Research Agent
export {
  CompanyResearchAgent,
  getCompanyResearchAgent,
  initializeCompanyResearchAgent,
  resetCompanyResearchAgent,
  type CompanyResearchResult,
  type BatchResearchResult,
  type CandidateWithCompany,
} from './CompanyResearchAgent.js';

// Boolean Query Validation
export {
  BooleanQueryValidator,
  getBooleanQueryValidator,
  resetBooleanQueryValidator,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type QueryStats,
  type ApiType,
  type ValidationErrorType,
  type ValidationWarningType,
} from './BooleanQueryValidator.js';

// Boolean Patterns Library
export {
  TITLE_PATTERNS,
  SKILL_PATTERNS,
  EXCLUSION_PATTERNS,
  SENIORITY_PATTERNS,
  COMPANY_PATTERNS,
  buildPatternQuery,
  buildTermGroup,
  getPatterns,
  getPatternLabels,
  type TitlePattern,
  type SkillPattern,
  type ExclusionPattern,
  type SeniorityPattern,
  type CompanyPattern,
} from './BooleanPatterns.js';

// Riley Auto-Responder Service
export {
  RileyAutoResponder,
  rileyAutoResponder,
  type AutoResponseContext,
  type AutoResponseResult,
} from './RileyAutoResponder.js';

// Conversation Service
export {
  ConversationService,
  conversationService,
  type Conversation,
  type ConversationMessage,
  type ConversationStage,
  type ResponseGenerationContext,
  type GeneratedResponse,
} from './ConversationService.js';

// Pre-Screening Assessment Service
export {
  PreScreeningService,
  preScreeningService,
  type CreateTemplateInput,
  type CreateQuestionInput,
  type CreateAssessmentLinkInput,
  type AssessmentLinkResult,
  type SubmitAnswersInput,
  type AssessmentFormData,
  type AssessmentResult,
} from './PreScreeningService.js';

// Assessment Scorer (AI-powered)
export {
  AssessmentScorer,
  assessmentScorer,
  type ScoringContext,
  type ScoringResult,
  type AssessmentFlag,
  type DimensionScore as AssessmentDimensionScore,
} from './AssessmentScorer.js';

// Outreach Template Service
export {
  OutreachTemplateService,
  outreachTemplateService,
  getOutreachTemplateService,
  type OutreachCategory,
  type TemplateChannel,
  type CreateTemplateInput as CreateOutreachTemplateInput,
  type UpdateTemplateInput as UpdateOutreachTemplateInput,
  type TemplateVariables,
} from './OutreachTemplateService.js';
