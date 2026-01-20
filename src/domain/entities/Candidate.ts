/**
 * Candidate - Core recruiting entity
 *
 * Represents a person in the recruiting pipeline.
 * Tracks their journey from sourcing through hire.
 */

// =============================================================================
// PIPELINE STAGES
// =============================================================================

export type PipelineStage =
  | 'SOURCED'
  | 'CONTACTED'
  | 'RESPONDED'
  | 'SCREENING'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEWING'
  | 'OFFER_EXTENDED'
  | 'OFFER_ACCEPTED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type CandidateStatus = 'ACTIVE' | 'ON_HOLD' | 'ARCHIVED' | 'DO_NOT_CONTACT';

// =============================================================================
// CANDIDATE PROFILE
// =============================================================================

export interface CandidateProfile {
  // Current position
  currentTitle?: string;
  currentCompany?: string;
  currentLocation?: string;

  // Skills
  skills: Skill[];
  topSkills: string[]; // Highlighted skills

  // Experience
  totalYearsExperience?: number;
  experience: Experience[];

  // Education
  education: Education[];
  highestDegree?: string;

  // Additional info
  languages?: Language[];
  certifications?: Certification[];
  summary?: string;

  // Social/online presence
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  personalWebsite?: string;
}

export interface Skill {
  name: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsUsed?: number;
  endorsements?: number;
  lastUsed?: string;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  location?: string;
  startDate: string;
  endDate?: string; // null = current
  isCurrent: boolean;
  description?: string;
  highlights?: string[];
  skills?: string[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: number;
  honors?: string[];
  activities?: string[];
}

export interface Language {
  name: string;
  proficiency: 'basic' | 'conversational' | 'professional' | 'native';
}

export interface Certification {
  name: string;
  issuer: string;
  issueDate?: string;
  expirationDate?: string;
  credentialId?: string;
}

// =============================================================================
// CANDIDATE SCORING
// =============================================================================

export interface CandidateScore {
  overall: number; // 0-100
  breakdown: ScoreDimension[];
  calculatedAt: Date;
  version: number; // Criteria version used
}

export interface ScoreDimension {
  dimension: string;
  score: number;
  maxScore: number;
  weight: number;
  reasoning?: string;
  evidence?: string[];
}

// =============================================================================
// CANDIDATE FLAGS
// =============================================================================

export interface CandidateFlag {
  type: FlagType;
  reason: string;
  addedBy: 'AGENT' | 'TELEOPERATOR' | 'SYSTEM';
  addedAt: Date;
  expiresAt?: Date;
}

export type FlagType =
  | 'vip' // High-priority candidate
  | 'referral' // Internal referral
  | 'previous_applicant' // Applied before
  | 'competitor' // Works at competitor
  | 'boomerang' // Former employee
  | 'do_not_contact' // Opted out
  | 'requires_visa' // Immigration status
  | 'relocation_required' // Not local
  | 'salary_mismatch' // Expectations don't match
  | 'schedule_conflict' // Availability issues
  | 'custom';

// =============================================================================
// EXTERNAL IDS (for deduplication)
// =============================================================================

export interface ExternalId {
  source: string; // e.g., "linkedin", "greenhouse", "indeed"
  id: string;
  url?: string;
  lastSynced?: Date;
}

// =============================================================================
// STAGE HISTORY
// =============================================================================

export interface StageHistoryEntry {
  stage: PipelineStage;
  enteredAt: Date;
  exitedAt?: Date;
  reason?: string;
  changedBy: 'AGENT' | 'TELEOPERATOR' | 'SYSTEM';
  notes?: string;
}

// =============================================================================
// MAIN CANDIDATE TYPE
// =============================================================================

export interface Candidate {
  id: string;
  tenantId: string;
  requisitionId?: string;

  // External IDs for deduplication
  externalIds: ExternalId[];

  // Basic info
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;

  // Resume
  resumeUrl?: string;
  resumeParsedAt?: Date;

  // Full profile
  profile: CandidateProfile;

  // Pipeline tracking
  stage: PipelineStage;
  stageHistory: StageHistoryEntry[];

  // Scoring
  score?: CandidateScore;

  // Flags
  flags: CandidateFlag[];

  // Source tracking
  source?: string;
  sourceDetails?: Record<string, unknown>;

  // Status
  status: CandidateStatus;
  rejectionReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getFullName(candidate: Candidate): string {
  return `${candidate.firstName} ${candidate.lastName}`.trim();
}

export function isActiveStage(stage: PipelineStage): boolean {
  return !['REJECTED', 'WITHDRAWN', 'HIRED'].includes(stage);
}

export function canContact(candidate: Candidate): boolean {
  return (
    candidate.status !== 'DO_NOT_CONTACT' &&
    candidate.status !== 'ARCHIVED' &&
    !candidate.flags.some((f) => f.type === 'do_not_contact')
  );
}
