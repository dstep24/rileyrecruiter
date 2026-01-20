/**
 * Onboarding Pipeline Module
 *
 * Handles automated company deployment:
 * - Document ingestion and parsing
 * - Pattern extraction (roles, brand voice, success factors)
 * - Baseline Guidelines/Criteria generation
 * - Shadow mode observation and learning
 * - Graduated autonomy controls
 */

export {
  DocumentIngestionService,
  DocumentIngestionConfig,
  IngestedDocument,
  ClassifiedDocument,
  DocumentFormat,
  ExtractedContent,
  DocumentSection,
  ExtractedEntity,
  EntityType,
  DocumentMetadata,
  DocumentType,
  ExtractedPattern,
  PatternCategory,
  getDocumentIngestionService,
} from './DocumentIngestion.js';

export {
  PatternExtractionService,
  PatternExtractionConfig,
  RolePattern,
  RoleLevel,
  SkillRequirement,
  ExperienceRequirement,
  EducationRequirement,
  BrandVoicePattern,
  ToneProfile,
  VocabularyProfile,
  StyleProfile,
  BrandVoiceExample,
  SuccessFactorPattern,
  SuccessCategory,
  SuccessFactor,
  AntiPattern,
  CommunicationPattern,
  CommunicationPurpose,
  CommunicationTemplate,
  TimingGuidance,
  ExtractedPatterns,
  getPatternExtractionService,
} from './PatternExtraction.js';

export {
  BaselineGeneratorService,
  BaselineGeneratorConfig,
  GeneratedBaseline,
  BaselineMetadata,
  getBaselineGeneratorService,
} from './BaselineGenerator.js';

export {
  ShadowModeRunner,
  ShadowModeConfig,
  CaptureType,
  ShadowSession,
  ShadowStats,
  CapturedInteraction,
  InteractionContext,
  HumanAction,
  RileyAlternative,
  ComparisonResult,
  DimensionComparison,
  GuidelineUpdate,
  ShadowLearning,
  LearnedPattern,
  CriteriaUpdate,
  createShadowModeRunner,
} from './ShadowMode.js';

export {
  AutonomyController,
  AutonomyConfig,
  PromotionThresholds,
  DemotionThresholds,
  EscalationRule,
  EscalationCondition,
  AutonomyLevel,
  ApprovalRequirements,
  AutonomyMetrics,
  AutonomyTransition,
  ActionContext,
  getAutonomyController,
} from './AutonomyControls.js';
