/**
 * Pattern Extraction Service
 *
 * Analyzes ingested documents to extract patterns for:
 * - Role patterns (job requirements, qualifications)
 * - Brand voice (tone, style, terminology)
 * - Success factors (what makes good candidates)
 * - Communication patterns (email styles, messaging)
 *
 * These patterns feed into baseline G/C generation.
 */

import { v4 as uuid } from 'uuid';
import { getClaudeClient, ClaudeClient } from '../integrations/llm/ClaudeClient.js';
import type { ClassifiedDocument, ExtractedPattern } from './DocumentIngestion.js';

// =============================================================================
// TYPES
// =============================================================================

export interface PatternExtractionConfig {
  minConfidence: number;
  maxPatternsPerCategory: number;
}

const DEFAULT_CONFIG: PatternExtractionConfig = {
  minConfidence: 0.6,
  maxPatternsPerCategory: 10,
};

// Role Patterns
export interface RolePattern {
  id: string;
  title: string;
  department?: string;
  level?: RoleLevel;
  requiredSkills: SkillRequirement[];
  preferredSkills: SkillRequirement[];
  experienceRequirements: ExperienceRequirement[];
  educationRequirements: EducationRequirement[];
  responsibilities: string[];
  qualifications: string[];
  benefits?: string[];
  salaryRange?: { min: number; max: number; currency: string };
  sourceDocuments: string[];
  confidence: number;
}

export type RoleLevel = 'entry' | 'mid' | 'senior' | 'lead' | 'manager' | 'director' | 'executive';

export interface SkillRequirement {
  skill: string;
  category: 'technical' | 'soft' | 'domain';
  importance: 'must_have' | 'nice_to_have';
  yearsExpected?: number;
}

export interface ExperienceRequirement {
  type: string;
  minYears?: number;
  maxYears?: number;
  description: string;
}

export interface EducationRequirement {
  level: 'high_school' | 'associate' | 'bachelor' | 'master' | 'doctorate' | 'any';
  field?: string;
  required: boolean;
}

// Brand Voice Patterns
export interface BrandVoicePattern {
  id: string;
  name: string;
  description: string;
  tone: ToneProfile;
  vocabulary: VocabularyProfile;
  style: StyleProfile;
  examples: BrandVoiceExample[];
  sourceDocuments: string[];
  confidence: number;
}

export interface ToneProfile {
  formality: 'casual' | 'conversational' | 'professional' | 'formal';
  warmth: 'cold' | 'neutral' | 'warm' | 'enthusiastic';
  confidence: 'humble' | 'balanced' | 'confident' | 'assertive';
  personality: string[]; // e.g., ["friendly", "innovative", "supportive"]
}

export interface VocabularyProfile {
  preferredTerms: Array<{ term: string; context: string }>;
  avoidedTerms: Array<{ term: string; reason: string }>;
  industryJargon: string[];
  companySpeakTerms: string[];
}

export interface StyleProfile {
  sentenceLength: 'short' | 'medium' | 'long' | 'varied';
  paragraphStyle: 'dense' | 'moderate' | 'airy';
  useOfLists: 'rarely' | 'sometimes' | 'frequently';
  useOfEmojis: 'never' | 'sparingly' | 'liberally';
  addressStyle: 'first_person' | 'second_person' | 'third_person';
}

export interface BrandVoiceExample {
  type: 'greeting' | 'pitch' | 'closing' | 'follow_up' | 'rejection';
  original: string;
  notes?: string;
}

// Success Factor Patterns
export interface SuccessFactorPattern {
  id: string;
  category: SuccessCategory;
  factors: SuccessFactor[];
  antiPatterns: AntiPattern[];
  sourceDocuments: string[];
  confidence: number;
}

export type SuccessCategory =
  | 'technical_excellence'
  | 'cultural_fit'
  | 'communication'
  | 'growth_potential'
  | 'reliability';

export interface SuccessFactor {
  name: string;
  description: string;
  indicators: string[];
  weight: number; // 0.0-1.0
  evaluationMethod: 'resume' | 'interview' | 'reference' | 'assessment';
}

export interface AntiPattern {
  name: string;
  description: string;
  redFlags: string[];
  severity: 'warning' | 'concern' | 'disqualifier';
}

// Communication Patterns
export interface CommunicationPattern {
  id: string;
  channel: 'email' | 'linkedin' | 'phone' | 'text';
  purpose: CommunicationPurpose;
  template: CommunicationTemplate;
  timing: TimingGuidance;
  sourceDocuments: string[];
  confidence: number;
}

export type CommunicationPurpose =
  | 'initial_outreach'
  | 'follow_up'
  | 'scheduling'
  | 'rejection'
  | 'offer'
  | 'nurture';

export interface CommunicationTemplate {
  subjectLine?: string;
  opening: string;
  body: string;
  closing: string;
  callToAction?: string;
  variables: string[]; // e.g., ["candidate_name", "role_title"]
}

export interface TimingGuidance {
  bestTimeOfDay?: string;
  bestDaysOfWeek?: string[];
  waitAfterNoResponse?: string; // e.g., "3 days"
  maxAttempts?: number;
}

// Aggregated Patterns
export interface ExtractedPatterns {
  tenantId: string;
  extractedAt: Date;
  roles: RolePattern[];
  brandVoice: BrandVoicePattern | null;
  successFactors: SuccessFactorPattern[];
  communications: CommunicationPattern[];
  rawPatterns: ExtractedPattern[];
  sourceDocuments: string[];
}

// =============================================================================
// PATTERN EXTRACTION SERVICE
// =============================================================================

export class PatternExtractionService {
  private config: PatternExtractionConfig;
  private claude: ClaudeClient;

  constructor(config: Partial<PatternExtractionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.claude = getClaudeClient();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Extract all patterns from a set of classified documents
   */
  async extractAllPatterns(
    tenantId: string,
    documents: ClassifiedDocument[]
  ): Promise<ExtractedPatterns> {
    // Group documents by type
    const jobDocs = documents.filter((d) => d.documentType === 'job_description');
    const companyDocs = documents.filter(
      (d) => d.documentType === 'company_overview' || d.documentType === 'employee_handbook'
    );
    const templateDocs = documents.filter((d) => d.documentType === 'email_template');
    const interviewDocs = documents.filter((d) => d.documentType === 'interview_guide');

    // Extract patterns in parallel
    const [roles, brandVoice, successFactors, communications] = await Promise.all([
      this.extractRolePatterns(jobDocs),
      this.extractBrandVoice([...companyDocs, ...templateDocs]),
      this.extractSuccessFactors([...jobDocs, ...interviewDocs]),
      this.extractCommunicationPatterns(templateDocs),
    ]);

    // Aggregate raw patterns from all documents
    const rawPatterns = documents.flatMap((d) => d.extractedPatterns);

    return {
      tenantId,
      extractedAt: new Date(),
      roles,
      brandVoice,
      successFactors,
      communications,
      rawPatterns,
      sourceDocuments: documents.map((d) => d.id),
    };
  }

  // ===========================================================================
  // ROLE PATTERN EXTRACTION
  // ===========================================================================

  /**
   * Extract role patterns from job descriptions
   */
  async extractRolePatterns(documents: ClassifiedDocument[]): Promise<RolePattern[]> {
    if (documents.length === 0) return [];

    const roles: RolePattern[] = [];

    for (const doc of documents) {
      const content = doc.content.rawText.substring(0, 8000);

      const response = await this.claude.chat({
        systemPrompt: `You are a job analysis expert. Extract detailed role patterns from job descriptions.

Output as JSON:
{
  "title": "Job title",
  "department": "Department if mentioned",
  "level": "entry|mid|senior|lead|manager|director|executive",
  "requiredSkills": [
    { "skill": "skill name", "category": "technical|soft|domain", "importance": "must_have|nice_to_have", "yearsExpected": null }
  ],
  "preferredSkills": [...],
  "experienceRequirements": [
    { "type": "type of experience", "minYears": 0, "maxYears": null, "description": "..." }
  ],
  "educationRequirements": [
    { "level": "bachelor|master|...", "field": "field if specified", "required": true/false }
  ],
  "responsibilities": ["responsibility 1", ...],
  "qualifications": ["qualification 1", ...],
  "benefits": ["benefit 1", ...] or null,
  "salaryRange": { "min": 0, "max": 0, "currency": "USD" } or null
}`,
        prompt: `Extract role patterns from this job description:\n\n${content}`,
        temperature: 0.2,
        maxTokens: 2000,
      });

      try {
        const roleData = this.claude.parseJsonResponse<Omit<RolePattern, 'id' | 'sourceDocuments' | 'confidence'>>(response);
        roles.push({
          ...roleData,
          id: uuid(),
          sourceDocuments: [doc.id],
          confidence: doc.typeConfidence,
        });
      } catch {
        console.warn(`[PatternExtraction] Failed to extract role from ${doc.filename}`);
      }
    }

    return roles;
  }

  // ===========================================================================
  // BRAND VOICE EXTRACTION
  // ===========================================================================

  /**
   * Extract brand voice patterns from company documents and templates
   */
  async extractBrandVoice(documents: ClassifiedDocument[]): Promise<BrandVoicePattern | null> {
    if (documents.length === 0) return null;

    // Combine relevant content from all documents
    const combinedContent = documents
      .map((d) => `--- ${d.filename} ---\n${d.content.rawText.substring(0, 3000)}`)
      .join('\n\n')
      .substring(0, 12000);

    const response = await this.claude.chat({
      systemPrompt: `You are a brand voice analyst. Analyze documents to extract the company's brand voice patterns.

Output as JSON:
{
  "name": "Brand voice name (e.g., 'Professional yet Friendly')",
  "description": "Brief description of the overall voice",
  "tone": {
    "formality": "casual|conversational|professional|formal",
    "warmth": "cold|neutral|warm|enthusiastic",
    "confidence": "humble|balanced|confident|assertive",
    "personality": ["trait1", "trait2"]
  },
  "vocabulary": {
    "preferredTerms": [{ "term": "term", "context": "when to use" }],
    "avoidedTerms": [{ "term": "term", "reason": "why avoided" }],
    "industryJargon": ["term1", ...],
    "companySpeakTerms": ["term1", ...]
  },
  "style": {
    "sentenceLength": "short|medium|long|varied",
    "paragraphStyle": "dense|moderate|airy",
    "useOfLists": "rarely|sometimes|frequently",
    "useOfEmojis": "never|sparingly|liberally",
    "addressStyle": "first_person|second_person|third_person"
  },
  "examples": [
    { "type": "greeting|pitch|closing|follow_up|rejection", "original": "example text", "notes": "optional" }
  ]
}`,
      prompt: `Analyze brand voice from these company documents:\n\n${combinedContent}`,
      temperature: 0.3,
      maxTokens: 2500,
    });

    try {
      const voiceData = this.claude.parseJsonResponse<Omit<BrandVoicePattern, 'id' | 'sourceDocuments' | 'confidence'>>(response);
      return {
        ...voiceData,
        id: uuid(),
        sourceDocuments: documents.map((d) => d.id),
        confidence: 0.8,
      };
    } catch {
      console.warn('[PatternExtraction] Failed to extract brand voice');
      return null;
    }
  }

  // ===========================================================================
  // SUCCESS FACTOR EXTRACTION
  // ===========================================================================

  /**
   * Extract success factor patterns from job descriptions and interview guides
   */
  async extractSuccessFactors(documents: ClassifiedDocument[]): Promise<SuccessFactorPattern[]> {
    if (documents.length === 0) return [];

    const combinedContent = documents
      .map((d) => d.content.rawText.substring(0, 3000))
      .join('\n\n---\n\n')
      .substring(0, 10000);

    const response = await this.claude.chat({
      systemPrompt: `You are a talent assessment expert. Extract success factors and anti-patterns from recruiting documents.

Output as JSON array:
[
  {
    "category": "technical_excellence|cultural_fit|communication|growth_potential|reliability",
    "factors": [
      {
        "name": "Factor name",
        "description": "What this factor means",
        "indicators": ["indicator 1", ...],
        "weight": 0.0-1.0,
        "evaluationMethod": "resume|interview|reference|assessment"
      }
    ],
    "antiPatterns": [
      {
        "name": "Anti-pattern name",
        "description": "What to watch out for",
        "redFlags": ["red flag 1", ...],
        "severity": "warning|concern|disqualifier"
      }
    ]
  }
]`,
      prompt: `Extract success factors and anti-patterns from these documents:\n\n${combinedContent}`,
      temperature: 0.3,
      maxTokens: 3000,
    });

    try {
      const factorsData = this.claude.parseJsonResponse<Array<Omit<SuccessFactorPattern, 'id' | 'sourceDocuments' | 'confidence'>>>(response);
      return factorsData.map((f) => ({
        ...f,
        id: uuid(),
        sourceDocuments: documents.map((d) => d.id),
        confidence: 0.75,
      }));
    } catch {
      console.warn('[PatternExtraction] Failed to extract success factors');
      return [];
    }
  }

  // ===========================================================================
  // COMMUNICATION PATTERN EXTRACTION
  // ===========================================================================

  /**
   * Extract communication patterns from email templates
   */
  async extractCommunicationPatterns(
    documents: ClassifiedDocument[]
  ): Promise<CommunicationPattern[]> {
    if (documents.length === 0) return [];

    const patterns: CommunicationPattern[] = [];

    for (const doc of documents) {
      const content = doc.content.rawText.substring(0, 5000);

      const response = await this.claude.chat({
        systemPrompt: `You are a communication analyst. Extract communication patterns from email templates.

Output as JSON array:
[
  {
    "channel": "email|linkedin|phone|text",
    "purpose": "initial_outreach|follow_up|scheduling|rejection|offer|nurture",
    "template": {
      "subjectLine": "Subject line if email",
      "opening": "Opening line/greeting",
      "body": "Main body content",
      "closing": "Closing line",
      "callToAction": "CTA if present",
      "variables": ["variable1", "variable2"]
    },
    "timing": {
      "bestTimeOfDay": "morning|afternoon|evening" or null,
      "bestDaysOfWeek": ["Monday", ...] or null,
      "waitAfterNoResponse": "X days" or null,
      "maxAttempts": number or null
    }
  }
]`,
        prompt: `Extract communication patterns from these templates:\n\n${content}`,
        temperature: 0.2,
        maxTokens: 2000,
      });

      try {
        const commData = this.claude.parseJsonResponse<Array<Omit<CommunicationPattern, 'id' | 'sourceDocuments' | 'confidence'>>>(response);
        for (const comm of commData) {
          patterns.push({
            ...comm,
            id: uuid(),
            sourceDocuments: [doc.id],
            confidence: doc.typeConfidence,
          });
        }
      } catch {
        console.warn(`[PatternExtraction] Failed to extract comms from ${doc.filename}`);
      }
    }

    return patterns;
  }

  // ===========================================================================
  // PATTERN MERGING
  // ===========================================================================

  /**
   * Merge similar role patterns (e.g., multiple JDs for same role)
   */
  mergeRolePatterns(roles: RolePattern[]): RolePattern[] {
    // Group by similar titles
    const grouped = new Map<string, RolePattern[]>();

    for (const role of roles) {
      const normalizedTitle = role.title.toLowerCase().replace(/\s+/g, ' ').trim();
      const existing = grouped.get(normalizedTitle) || [];
      existing.push(role);
      grouped.set(normalizedTitle, existing);
    }

    // Merge each group
    const merged: RolePattern[] = [];
    for (const [, group] of grouped) {
      if (group.length === 1) {
        merged.push(group[0]);
      } else {
        merged.push(this.mergeRoleGroup(group));
      }
    }

    return merged;
  }

  private mergeRoleGroup(roles: RolePattern[]): RolePattern {
    // Use the first role as base and merge in others
    const base = { ...roles[0] };
    base.sourceDocuments = roles.flatMap((r) => r.sourceDocuments);
    base.confidence = roles.reduce((sum, r) => sum + r.confidence, 0) / roles.length;

    // Merge skills (dedupe by name)
    const allRequired = new Map<string, SkillRequirement>();
    const allPreferred = new Map<string, SkillRequirement>();

    for (const role of roles) {
      for (const skill of role.requiredSkills) {
        const key = skill.skill.toLowerCase();
        if (!allRequired.has(key)) {
          allRequired.set(key, skill);
        }
      }
      for (const skill of role.preferredSkills) {
        const key = skill.skill.toLowerCase();
        if (!allPreferred.has(key)) {
          allPreferred.set(key, skill);
        }
      }
    }

    base.requiredSkills = Array.from(allRequired.values());
    base.preferredSkills = Array.from(allPreferred.values());

    // Merge responsibilities (dedupe)
    const allResponsibilities = new Set<string>();
    for (const role of roles) {
      for (const resp of role.responsibilities) {
        allResponsibilities.add(resp);
      }
    }
    base.responsibilities = Array.from(allResponsibilities);

    return base;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: PatternExtractionService | null = null;

export function getPatternExtractionService(
  config?: Partial<PatternExtractionConfig>
): PatternExtractionService {
  if (!serviceInstance) {
    serviceInstance = new PatternExtractionService(config);
  }
  return serviceInstance;
}
